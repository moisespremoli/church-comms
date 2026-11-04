"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { MIN_PASSWORD_LENGTH } from "@/lib/action-result";

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nome" htmlFor="full_name">
        <TextInput id="full_name" name="full_name" defaultValue={fullName} autoComplete="name" required maxLength={120} />
      </Field>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "A guardar…" : "Guardar"}
      </Button>
    </form>
  );
}

export function PasswordForm({ after }: { after?: "login" }) {
  const [state, action, pending] = useActionState(changePassword, null);
  return (
    <form action={action} className="space-y-4">
      {after ? <input type="hidden" name="after" value={after} /> : null}
      <Field label="Nova palavra-passe" htmlFor="password" hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}>
        <TextInput id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
      </Field>
      <Field label="Confirmar palavra-passe" htmlFor="confirm">
        <TextInput id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
      </Field>
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "A alterar…" : "Alterar palavra-passe"}
      </Button>
    </form>
  );
}
