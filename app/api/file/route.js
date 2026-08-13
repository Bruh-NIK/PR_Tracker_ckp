import { list, del } from "@vercel/blob";

const BLOB_PATH = "crew-data/current.xlsx";

function istDateString(date) {
  // YYYY-MM-DD in Asia/Kolkata, regardless of server region
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "crew-data/" });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH);

    if (!blob) {
      return Response.json({ valid: false });
    }

    const uploadedDate = istDateString(new Date(blob.uploadedAt));
    const today = istDateString(new Date());

    if (uploadedDate !== today) {
      // Expired - date has changed since upload. Clean it up.
      try {
        await del(blob.url);
      } catch (e) {
        // non-fatal
      }
      return Response.json({ valid: false, expired: true });
    }

    return Response.json({
      valid: true,
      url: blob.url,
      uploadedAt: blob.uploadedAt,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ valid: false, error: err.message }, { status: 500 });
  }
}
