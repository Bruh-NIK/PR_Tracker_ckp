import "./globals.css";

export const metadata = {
  title: "Crew PR Due Calculator",
  description: "Shared crew periodic-rest calculator",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
