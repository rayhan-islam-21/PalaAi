import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/terms", "/privacy", "/refund", "/support"], disallow: ["/admin", "/api", "/chat", "/dashboard", "/wallet", "/pay", "/payments", "/account"] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
