export const metadata = { title: 'Frontend', description: 'Next.js scaffold'};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{margin:0,fontFamily:'system-ui'}}>{children}</body>
    </html>
  );
}