import "./globals.css";

export const metadata = {
  title: "Interview Coach",
  description: "Interview Coach frontend",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
