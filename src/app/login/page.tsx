"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import { Spinner } from "@/components/ui";

function LoginForm() {
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
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-on-primary">
            <span className="text-lg font-bold">إن</span>
          </div>
          <h1 className="text-xl font-bold">تحليلات إنجوسوفت</h1>
          <p className="text-xs text-muted-foreground">لوحة تقارير خدمة عملاء Chatwoot</p>
        </div>
        <form onSubmit={submit} className="card space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم المستخدم</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" autoComplete="username" autoFocus required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">كلمة المرور</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" autoComplete="current-password" required />
          </div>
          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Spinner /> : <LogIn className="h-4 w-4" />} تسجيل الدخول
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
