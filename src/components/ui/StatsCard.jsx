const StatsCard = ({ label, value, subtitle, delta, deltaType = "up", icon: Icon, accent = "primary" }) => {
  const accentMap = {
    primary: "bg-primary-glow/10 text-primary-glow",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
    danger: "bg-destructive/10 text-destructive",
    muted: "bg-muted-foreground/15 text-muted-foreground",
  };

  return (
    <div className="glass-card rounded-3xl p-5 md:p-6 h-full flex flex-col">
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`grid h-10 w-10 place-items-center rounded-2xl ${accentMap[accent]} font-medium transition-colors`}>
          <Icon className="h-5 w-5" strokeWidth={2.2} />
        </div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      {subtitle && (
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      )}
      {delta && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${
            deltaType === "up" ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"
          }`}>
            {deltaType === "up" ? "▲" : "▼"} {delta}
          </span>
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
};

export default StatsCard;