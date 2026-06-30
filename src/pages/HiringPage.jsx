import { useState } from "react";
import { Sidebar } from "@/layout/Sidebar";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import HiringManagement from "@/components/Hiring/HiringManagement";

const HiringPage = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className={`grid min-h-screen transition-[grid-template-columns] duration-300 ease-in-out grid-cols-1 ${collapsed ? "lg:grid-cols-[88px_1fr]" : "lg:grid-cols-[260px_1fr]"}`}>
        <div className="hidden lg:block h-full" />
        <main className="flex flex-col h-screen overflow-hidden w-full">
          <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 lg:hidden">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} className="-ml-2">
                <Menu className="h-5 w-5" />
              </Button>
              <div className="font-semibold text-base">PayrollX</div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-[1600px] w-full mx-auto">
              <HiringManagement />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default HiringPage;
