import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Wallet, User, Lock, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/api/Api";
import { getDefaultRouteByRole, getUserRole, isAuthenticated, storeAuthTokens } from "@/auth/rbac";

const LoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("password");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAuthenticated()) {
      navigate(getDefaultRouteByRole(getUserRole()), { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await api.post("/api/auth/login/", {
        username,
        password,
      });

      const role = storeAuthTokens(response.data);
      if (!role) {
        setError("Role claim missing in JWT. Please contact your administrator.");
        return;
      }

      navigate(getDefaultRouteByRole(role), { replace: true });
    } catch {
      setError("Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 gradient-brand text-white overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Wallet className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Renderways Technology</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative space-y-4"
        >
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Payroll, perfected for modern teams.
          </h1>
          <p className="text-white/80 max-w-md">
            Run payroll in minutes, stay compliant by default, and give your team a delightful experience.
          </p>
          <div className="flex items-center gap-6 pt-4 text-sm text-white/70">
            <div><span className="text-white font-semibold">1,284</span> employees</div>
            <div><span className="text-white font-semibold">$1.84M</span> processed</div>
            <div><span className="text-white font-semibold">99.99%</span> uptime</div>
          </div>
        </motion.div>

        <div className="relative text-xs text-white/60">© 2026 Renderways Technology. All rights reserved.</div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-white">
              <Wallet className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Renderways Technology</span>
          </div>

          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Welcome back</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in to your account to continue.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9 h-11"
                  placeholder="Enter your username"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-xs text-primary hover:underline">Forgot password?</a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 h-11"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="rounded border-border" defaultChecked />
              Remember me for 30 days
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl gradient-brand text-white font-medium shadow-glow hover:opacity-95 transition"
            >
              {isLoading ? "Signing in..." : "Sign in"} <ArrowRight className="h-4 w-4" />
            </button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full h-11 rounded-xl border border-border bg-card hover:bg-muted/40 transition text-sm font-medium"
            >
              Continue with Google
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don't have an account? <a href="#" className="text-primary hover:underline font-medium">Create one</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
