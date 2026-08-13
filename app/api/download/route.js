import { get } from "@vercel/blob";

const BLOB_PATH = "crew-data/current.xlsx";

export async function GET() {
  try {
    const result = await get(BLOB_PATH, { access: "private" });

    if (!result) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        "Content-Type":
          result.blob.contentType || "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return new Response("Error: " + err.message, { status: 500 });
  }
}
