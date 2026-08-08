import "./globals.css";

export const metadata = {
  title: "Frontend Challenge",
  description: "A frontend practice challenge",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
