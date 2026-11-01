import "./globals.css";

export const metadata = {
  title: "Acro Party",
  description: "The acronym party game for friends and family",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b1035",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
