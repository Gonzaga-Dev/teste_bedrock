"use client";

import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";   // ← caminho relativo a partir de /app
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

Amplify.configure(outputs);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  return <Authenticator>{() => <>{children}</>}</Authenticator>;
}
