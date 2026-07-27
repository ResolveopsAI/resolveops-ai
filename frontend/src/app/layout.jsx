import "./globals.css";

export const metadata = {
  title: "ResolveOps AI — Command Center",
  description: "AI-powered autonomous SRE and incident resolution platform.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col bg-[#06091a] text-slate-100">
        {children}
      </body>
    </html>
  );
}
