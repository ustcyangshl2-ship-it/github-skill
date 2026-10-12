"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
export function LoginButton() { return <Button onClick={() => signIn("github", { callbackUrl: "/account" })}>使用 GitHub 登录</Button>; }
