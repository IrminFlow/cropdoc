import { clerkMiddleware } from "@clerk/nextjs/server";
// Makes the Clerk session available everywhere. Access checks live with the
// resources: the workspace layout protects pages, and each API route checks
// its own caller.
export default clerkMiddleware();
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
