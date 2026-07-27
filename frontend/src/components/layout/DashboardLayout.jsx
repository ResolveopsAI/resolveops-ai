import SidebarNavigation from "./SidebarNavigation";

export default function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen text-slate-200" style={{ background: "#06091a" }}>
      <SidebarNavigation />
      <main className="flex-1 p-5 flex flex-col overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
