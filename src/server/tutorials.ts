import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canReadTutorial } from "@/lib/access";

export async function readTutorial(slug: string) {
  const tutorial = await db.tutorial.findFirst({ where: { slug, status: "PUBLISHED" }, select: { id: true, slug: true, title: true, excerpt: true, access: true, publishedAt: true } });
  if (!tutorial) return { status: "missing" } as const;
  const user = tutorial.access === "MEMBER" ? await currentUser() : null;
  if (!canReadTutorial(tutorial.access, user?.memberships ?? [])) return { status: "locked", tutorial } as const;
  // Body is fetched only AFTER membership authorization, never in public includes.
  const body = await db.tutorialBody.findUnique({ where: { tutorialId: tutorial.id } });
  if (!body) return { status: "unfinished", tutorial } as const;
  return { status: "readable", tutorial, text: body.text } as const;
}
