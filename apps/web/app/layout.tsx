import type { Metadata } from "next"

import "@workspace/ui/globals.css"
import "./dashboard.css"
import { ThemeProvider } from "@/components/theme-provider"

export const metadata: Metadata = {
  title: "Skills Management",
  description:
    "Local-first dashboard for inspecting and controlling Codex skills, plugin bundles, and MCP servers.",
  robots: "noindex, nofollow",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="antialiased font-sans"
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
