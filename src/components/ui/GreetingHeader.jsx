import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, Sun, CloudSun, Moon } from "lucide-react";
import { getUserDisplayName, getUserRole } from "@/auth/rbac";

export const GreetingHeader = ({ subtitle = "" }) => {
  const [greeting, setGreeting] = useState("");
  const [Icon, setIcon] = useState(Sun);
  const name = getUserDisplayName();
  const role = getUserRole();

  const getRoleBadge = (roleStr) => {
    switch (roleStr) {
      case "super_admin": return "Super Admin";
      case "admin": return "Administrator";
      case "hr": return "HR Manager";
      case "employee": return "Employee";
      default: return "";
    }
  };
  const roleLabel = getRoleBadge(role);
  
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting("Good Morning");
      setIcon(Sun);
    } else if (hour < 17) {
      setGreeting("Good Afternoon");
      setIcon(CloudSun);
    } else {
      setGreeting("Good Evening");
      setIcon(Moon);
    }
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-card/80 to-card/40 border border-border/50 p-6 md:p-8 backdrop-blur"
    >
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5 animate-pulse" />
            </div>
            <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              {today}
            </span>
          </div>
          
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight leading-tight text-foreground">
            {greeting}, <span className="text-gradient animate-gradient bg-300%">{name}</span> 
            {roleLabel && (
              <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 align-middle select-none">
                {roleLabel}
              </span>
            )}
            <motion.span
              className="inline-block ml-2 origin-bottom-right"
              animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                repeatDelay: 2,
                ease: "easeInOut"
              }}
            >
              👋
            </motion.span>
          </h1>
          
          <p className="mt-2 text-sm md:text-base text-muted-foreground/90 max-w-xl">
            {subtitle || "Welcome back! Here's what's happening with your workspace today."}
          </p>
        </div>

        {/* <div className="hidden md:flex items-center gap-3.5 px-5 py-3 bg-primary/5 border border-primary/10 rounded-2xl backdrop-blur-md">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5 animate-spin-slow" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-primary/70">Quick Tip</div>
            <div className="text-xs font-medium text-foreground">Stay focused and have a great day!</div>
          </div>
        </div> */}
      </div>
    </motion.div>
  );
};

export default GreetingHeader;
