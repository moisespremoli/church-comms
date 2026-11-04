"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <TextInput id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field label="Palavra-passe" htmlFor="password">
        <TextInput id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state && !state.ok ? <Notice tone="error">{state.message}</Notice> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "A entrar…" : "Entrar"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/recuperar" className="font-semibold text-accent underline-offset-4 hover:underline">
          Esqueci-me da palavra-passe
        </Link>
      </p>
    </form>
  );
}
