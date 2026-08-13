import { put } from "@vercel/blob";

// Fixed pathname so every upload overwrites the same shared "today's file".
const BLOB_PATH = "crew-data/current.xlsx";

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const name = (file.name || "").toLowerCase();
    if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
      return Response.json(
        { error: "Please upload a .xls or .xlsx file" },
        { status: 400 }
      );
    }

    const blob = await put(BLOB_PATH, file, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    return Response.json({ url: blob.url, uploadedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Upload failed: " + err.message }, { status: 500 });
  }
}
