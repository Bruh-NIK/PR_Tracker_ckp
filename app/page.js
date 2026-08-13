"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

function parseDateTime(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi));
}

function fmt(d) {
  if (!d) return "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map((c) => String(c).toUpperCase());
    if (row.some((c) => c.includes("LAST AVAILED PR DATE"))) return i;
  }
  return -1;
}

function parseWorkbookRows(rows) {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx === -1) {
    throw new Error(
      'Could not find the "LAST AVAILED PR DATE" column in this file.'
    );
  }
  const headers = rows[headerIdx].map((h) => String(h).toUpperCase().trim());
  const idx = {
    sno: headers.findIndex(
      (h) => h.includes("S. NO") || h.includes("S.NO") || h === "S NO"
    ),
    crewId: headers.findIndex((h) => h.includes("CREW ID")),
    crewName: headers.findIndex((h) => h.includes("CREW NAME")),
    desg: headers.findIndex((h) => h.includes("DESG")),
    lastPR: headers.findIndex((h) => h.includes("LAST AVAILED PR DATE")),
  };

  const now = new Date();
  const result = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const crewIdRaw = idx.crewId >= 0 ? String(row[idx.crewId] || "").trim() : "";
    if (!crewIdRaw) continue;

    const sno = idx.sno >= 0 ? row[idx.sno] : i - headerIdx;
    const crewId = crewIdRaw.replace(/^[@#]\s*/, "");
    const crewName = idx.crewName >= 0 ? String(row[idx.crewName] || "").trim() : "";
    const desg = idx.desg >= 0 ? String(row[idx.desg] || "").trim() : "";
    const lastPRraw = idx.lastPR >= 0 ? String(row[idx.lastPR] || "").trim() : "";
    const lastPRDate = parseDateTime(lastPRraw);

    let entry = {
      sno,
      crewId,
      crewName,
      desg,
      lastPRraw,
      lastPR: lastPRDate,
      addHrs: null,
      availTime: null,
      nextDue: null,
      remaining: null,
      status: "na",
    };

    if (lastPRDate) {
      const hour = lastPRDate.getHours();
      const addHrs = hour >= 22 && hour <= 23 ? 32 : 30;
      const availTime = new Date(lastPRDate.getTime() + addHrs * 3600 * 1000);
      const nextDue = new Date(availTime.getTime() + 6 * 24 * 3600 * 1000);
      const remainingHrs = (nextDue.getTime() - now.getTime()) / 3600000;

      entry.addHrs = addHrs;
      entry.availTime = availTime;
      entry.nextDue = nextDue;
      entry.remaining = remainingHrs;
      entry.status =
        remainingHrs < 0 ? "overdue" : remainingHrs <= 24 ? "soon" : "ok";
    }

    result.push(entry);
  }

  return result;
}

export default function Home() {
  const [screen, setScreen] = useState("checking"); // checking | upload | search
  const [allRows, setAllRows] = useState([]);
  const [uploadedAt, setUploadedAt] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [drag, setDrag] = useState(false);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [noMatch, setNoMatch] = useState(false);

  const [showFullList, setShowFullList] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const fileInputRef = useRef(null);

  async function loadFile(uploadedAtVal) {
    const res = await fetch("/api/download", { cache: "no-store" });
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch (e) {
        // ignore
      }
      throw new Error(
        `Could not load the stored file (status ${res.status}). ${detail}`
      );
    }
    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    const parsed = parseWorkbookRows(rows);
    setAllRows(parsed);
    setUploadedAt(uploadedAtVal);
    setScreen("search");
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/file");
        const data = await res.json();
        if (data.valid) {
          await loadFile(data.uploadedAt);
        } else {
          setScreen("upload");
        }
      } catch (e) {
        setUploadError(e.message);
        setScreen("upload");
      }
    })();
  }, []);

  async function handleFile(file) {
    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await loadFile(data.uploadedAt);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function onSearchInput(e) {
    const q = e.target.value;
    setQuery(q);
    setSelected(null);
    setNoMatch(false);
    const qu = q.trim().toUpperCase();
    if (!qu) {
      setSuggestions([]);
      return;
    }
    const matches = allRows
      .filter(
        (r) =>
          r.crewId.toUpperCase().includes(qu) ||
          r.crewName.toUpperCase().includes(qu)
      )
      .slice(0, 8);
    setSuggestions(matches);
  }

  function selectCrew(crewId) {
    const r = allRows.find((x) => x.crewId === crewId);
    if (!r) return;
    setSelected(r);
    setQuery(r.crewId);
    setSuggestions([]);
    setNoMatch(false);
  }

  function onSearchKeyDown(e) {
    if (e.key !== "Enter") return;
    const qu = query.trim().toUpperCase();
    const exact = allRows.find((r) => r.crewId.toUpperCase() === qu);
    if (exact) {
      selectCrew(exact.crewId);
      return;
    }
    const first = allRows.find(
      (r) =>
        r.crewId.toUpperCase().includes(qu) ||
        r.crewName.toUpperCase().includes(qu)
    );
    if (first) {
      selectCrew(first.crewId);
    } else {
      setSelected(null);
      setNoMatch(true);
      setSuggestions([]);
    }
  }

  function resetToUpload() {
    setScreen("upload");
    setAllRows([]);
    setSelected(null);
    setQuery("");
    setSuggestions([]);
    setUploadError("");
  }

  // Full list filter + sort
  let filtered = allRows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    const s = listSearch.trim().toUpperCase();
    if (
      s &&
      !(
        r.crewId.toUpperCase().includes(s) ||
        r.crewName.toUpperCase().includes(s)
      )
    )
      return false;
    return true;
  });

  if (sortKey) {
    filtered = [...filtered].sort((a, b) => {
      let va = a[sortKey],
        vb = b[sortKey];
      if (va instanceof Date) va = va.getTime();
      if (vb instanceof Date) vb = vb.getTime();
      if (va === null || va === undefined) va = sortAsc ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = sortAsc ? Infinity : -Infinity;
      if (typeof va === "string") va = va.toUpperCase();
      if (typeof vb === "string") vb = vb.toUpperCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const counts = { overdue: 0, soon: 0, ok: 0, na: 0 };
  allRows.forEach((r) => counts[r.status]++);

  const columns = [
    ["sno", "S.No"],
    ["crewId", "Crew ID"],
    ["crewName", "Crew Name"],
    ["desg", "Desg."],
    ["lastPRraw", "Last Availed PR"],
    ["addHrs", "Hrs Added"],
    ["availTime", "Available Time"],
    ["nextDue", "Next PR Due"],
    ["remaining", "Hrs Remaining"],
    ["status", "Status"],
  ];

  return (
    <>
      <header>
        <div>
          <h1>Crew PR Due Calculator</h1>
          <p>Shared file — today&apos;s upload is visible to everyone, and expires at midnight (IST).</p>
        </div>
        {screen === "search" && (
          <div className="header-actions">
            <button onClick={resetToUpload}>Upload a different file</button>
          </div>
        )}
      </header>

      <div className="wrap">
        {screen === "checking" && (
          <div className="spinner-wrap">Checking for today&apos;s file...</div>
        )}

        {screen === "upload" && (
          <div>
            <div
              className={"upload-box" + (drag ? " drag" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
            >
              <div>📄 Drag &amp; drop the Excel file here, or</div>
              <label htmlFor="fileInput">Choose File</label>
              <input
                id="fileInput"
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={(e) => {
                  if (e.target.files[0]) handleFile(e.target.files[0]);
                }}
              />
              <div id="fileName">
                {uploading
                  ? "Uploading and processing..."
                  : uploadError
                  ? "Error: " + uploadError
                  : "No file selected"}
              </div>
              <div className="rule-note">
                Uses only the <strong>LAST AVAILED PR DATE</strong> column. If the
                time falls between 22:00–23:59, Available Time = that date/time +
                32 hours; otherwise + 30 hours. Next PR Due = Available Time + 6
                days. This file is shared — anyone visiting will see it, and it
                automatically stops being valid once the date changes (IST), so a
                new file must be uploaded each day.
              </div>
            </div>
          </div>
        )}

        {screen === "search" && (
          <div>
            <div className="status-banner">
              Current file uploaded {uploadedAt ? fmt(new Date(uploadedAt)) : "—"}{" "}
              (IST) · valid until midnight today
            </div>

            <div className="search-panel">
              <h2>Find a crew member</h2>
              <div className="hint">
                Type a Crew ID (e.g. ADTP1796) or a name — matches appear as you
                type.
              </div>
              <div className="search-input-wrap">
                <input
                  id="crewSearchInput"
                  type="text"
                  placeholder="Enter Crew ID..."
                  autoComplete="off"
                  value={query}
                  onChange={onSearchInput}
                  onKeyDown={onSearchKeyDown}
                />
                {suggestions.length > 0 && (
                  <div className="suggestions">
                    {suggestions.map((r) => (
                      <div key={r.crewId} onClick={() => selectCrew(r.crewId)}>
                        <span className="sugg-id">{r.crewId}</span>{" "}
                        <span className="sugg-name">
                          {r.crewName}
                          {r.desg ? " · " + r.desg : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {noMatch && (
                <div className="no-match">No crew member matches that ID.</div>
              )}
            </div>

            {selected && (
              <div className={"result-card status-" + selected.status}>
                <div className="rc-top">
                  <div>
                    <div className="rc-id">{selected.crewId}</div>
                    <div className="rc-name">{selected.crewName || "—"}</div>
                  </div>
                  <div className="rc-pill">
                    {
                      {
                        overdue: "⚠ OVERDUE",
                        soon: "DUE SOON",
                        ok: "OK",
                        na: "NO PR DATA",
                      }[selected.status]
                    }
                  </div>
                </div>
                <div className="rc-grid">
                  <div className="rc-field">
                    <div className="fl">Designation</div>
                    <div className="fv">{selected.desg || "—"}</div>
                  </div>
                  <div className="rc-field">
                    <div className="fl">Last Availed PR</div>
                    <div className="fv">{selected.lastPRraw || "—"}</div>
                  </div>
                  <div className="rc-field">
                    <div className="fl">Available Time</div>
                    <div className="fv">{fmt(selected.availTime)}</div>
                  </div>
                  <div className="rc-field">
                    <div className="fl">Next PR Due</div>
                    <div className="fv">{fmt(selected.nextDue)}</div>
                  </div>
                  <div className="rc-field big-remaining">
                    <div className="fl">Hours Remaining</div>
                    <div className="fv">
                      {selected.remaining !== null
                        ? selected.remaining.toFixed(1) + " hrs"
                        : "No PR data"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <span
                className="toggle-list-link"
                onClick={() => setShowFullList(!showFullList)}
              >
                {showFullList ? "Hide full crew list ▴" : "View full crew list ▾"}
              </span>
            </div>

            {showFullList && (
              <div>
                <div className="summary">
                  <div className="card overdue">
                    <div className="num">{counts.overdue}</div>
                    <div className="label">Overdue</div>
                  </div>
                  <div className="card soon">
                    <div className="num">{counts.soon}</div>
                    <div className="label">Due within 24 hrs</div>
                  </div>
                  <div className="card ok">
                    <div className="num">{counts.ok}</div>
                    <div className="label">Not due yet</div>
                  </div>
                  <div className="card">
                    <div className="num">{counts.na}</div>
                    <div className="label">No PR data</div>
                  </div>
                </div>

                <div className="controls">
                  <input
                    type="text"
                    placeholder="Filter list by Crew ID or Name..."
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="overdue">Overdue</option>
                    <option value="soon">Due within 24 hrs</option>
                    <option value="ok">Not due yet</option>
                    <option value="na">No PR data</option>
                  </select>
                </div>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {columns.map(([key, label]) => (
                          <th key={key} onClick={() => toggleSort(key)}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.crewId} className={"row-" + r.status}>
                          <td>{r.sno}</td>
                          <td>{r.crewId}</td>
                          <td>{r.crewName}</td>
                          <td>{r.desg}</td>
                          <td>{r.lastPRraw || "-"}</td>
                          <td>{r.addHrs !== null ? r.addHrs + " hrs" : "-"}</td>
                          <td>{fmt(r.availTime)}</td>
                          <td>{fmt(r.nextDue)}</td>
                          <td>
                            {r.remaining !== null
                              ? r.remaining.toFixed(1) + " hrs"
                              : "-"}
                          </td>
                          <td>
                            <span className={"status-pill " + r.status}>
                              {
                                {
                                  overdue: "Overdue",
                                  soon: "Due Soon",
                                  ok: "OK",
                                  na: "No Data",
                                }[r.status]
                              }
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer>Data is stored in Vercel Blob and cleared automatically after the day it was uploaded.</footer>
    </>
  );
}
