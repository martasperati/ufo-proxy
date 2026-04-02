const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'apify~instagram-profile-scraper';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { usernames } = req.query;
  if (!usernames) return res.status(400).json({ error: 'usernames richiesti' });

  const list = usernames.split(',').map(u => u.trim().replace('@', '')).filter(Boolean);

  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=60&memory=256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: list })
      }
    );

    if (!runRes.ok) {
      const err = await runRes.text();
      return res.status(500).json({ error: 'Apify error', detail: err });
    }

    const data = await runRes.json();

    const profiles = data.map(p => ({
      username: p.username || '',
      fullName: p.fullName || '',
      followers: p.followersCount || 0,
      following: p.followsCount || 0,
      posts: p.postsCount || 0,
      avgLikes: p.avgLikes || 0,
      avgComments: p.avgComments || 0,
      engagementRate: p.engagementRate || calcEng(p),
      verified: p.verified || false,
      biography: p.biography || '',
      profilePicUrl: p.profilePicUrl || '',
      timestamp: new Date().toISOString(),
      recentPosts: (p.latestPosts || []).slice(0, 6).map(post => ({
        url: post.url || '',
        likes: post.likesCount || 0,
        comments: post.commentsCount || 0,
        timestamp: post.timestamp || '',
        type: post.type || 'image',
        caption: (post.caption || '').slice(0, 120),
        displayUrl: post.displayUrl || ''
      }))
    }));

    return res.status(200).json({ ok: true, profiles, scrapedAt: new Date().toISOString() });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function calcEng(p) {
  if (!p.followersCount || p.followersCount === 0) return 0;
  const likes = p.avgLikes || 0;
  const comments = p.avgComments || 0;
  return parseFloat(((likes + comments) / p.followersCount * 100).toFixed(2));
}
