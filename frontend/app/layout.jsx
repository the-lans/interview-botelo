import "./globals.css";

export const metadata = {
  title: "Interview Coach",
  description: "Interview Coach frontend",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <main>
          <nav>
            <a href="/login">Login</a>
            <a href="/signup">Signup</a>
            <a href="/dashboard">Dashboard</a>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
