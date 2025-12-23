import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: ['/', '/api/og/*', '/dashboard/solve/*'],
            disallow: ['/dashboard/', '/admin/'],
        },
        sitemap: 'https://provashub.vercel.app/sitemap.xml',
    }
}
