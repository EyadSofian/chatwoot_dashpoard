"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import { Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { useLocale } from "@/lib/i18n";

function LoginForm() {
  const { tr } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiPost("/api/auth/login", { username, password });
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-xs text-muted-foreground">{tr("لوحة تحليلات خدمة عملاء Chatwoot", "Chatwoot customer service analytics")}</p>
        </div>
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{tr("اسم المستخدم", "Username")}</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" autoComplete="username" autoFocus required />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">{tr("كلمة المرور", "Password")}</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" autoComplete="current-password" required />
          </div>
          {error && (
            <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive-fg">{error}</div>
          )}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Spinner /> : <LogIn className="h-4 w-4" />} {tr("تسجيل الدخول", "Sign in")}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <LoginForm />
    </Suspense>
  );
}
