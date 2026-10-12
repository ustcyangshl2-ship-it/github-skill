import { getServerSession, type NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

export function authConfigured() {
  return Boolean(process.env.NEXTAUTH_SECRET && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "database" },
  providers: authConfigured() ? [GithubProvider({ clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! })] : [],
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    }
  }
};
export async function currentUser() {
  if (!process.env.NEXTAUTH_SECRET) return null;
  const session = await getServerSession(authOptions);
  if (!session?.user.id) return null;
  // Never trust roles or membership provided by the browser/session.
  return db.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, memberships: true } });
}
