const APIFY_TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = 'apify~instagram-profile-scraper';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'https://placeholder.com');
  const usernames = url.searchParams.get('usernames');
  const runId = url.searchParams.get('runId');

  if (runId && !usernames) {
    try {
      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`);
      const statusData = await statusRes.json();
      const status = statusData.data && statusData.data.status;

      if (status === 'SUCCEEDED') {
        const datasetId = statusData.data.defaultDatasetId;
        const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}&clean=true`);
        const items = await itemsRes.json();
        return res.status(200).json({ ok: true, status: 'done', profiles: items.map(normalizeProfile) });
      }
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return res.status(500).json({ ok: false, status: 'failed', error: 'Run fallito: ' + status });
      }
      return res.status(200).json({ ok: true, status: 'running', runStatus: status });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (usernames && !runId) {
    const list = usernames.split(',').map(function(u) { return u.trim().replace('@', ''); }).filter(Boolean);
    if (list.length === 0) return res.status(400).json({ error: 'nessun username valido' });

    try {
      const runRes = await fetch(
        'https://api.apify.com/v2/acts/' + ACTOR_ID + '/runs?token=' + APIFY_TOKEN + '&memory=256',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: list })
        }
      );
      if (!runRes.ok) {
        const errText = await runRes.text();
        return res.status(500).json({ ok: false, error: errText });
      }
      const runData = await runRes.json();
      const newRunId = runData.data && runData.data.id;
      if (!newRunId) return res.status(500).json({ ok: false, error: 'Run ID non trovato' });
      return res.status(200).json({ ok: true, status: 'started', runId: newRunId });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Specifica usernames oppure runId' });
};

function normalizeProfile(p) {
  var followers = p.followersCount || 0;
  var avgLikes = p.avgLikes || 0;
  var avgComments = p.avgComments || 0;
  return {
    username: p.username || '',
    fullName: p.fullName || '',
    followers: followers,
    following: p.followsCount || 0,
    posts: p.postsCount || 0,
    avgLikes: avgLikes,
    avgComments: avgComments,
    engagementRate: followers > 0 ? parseFloat(((avgLikes + avgComments) / followers * 100).toFixed(2)) : (p.engagementRate || 0),
    verified: p.verified || false,
    biography: p.biography || '',
    profilePicUrl: p.profilePicUrl || '',
    timestamp: new Date().toISOString(),
    recentPosts: (p.latestPosts || []).slice(0, 6).map(function(post) {
      return {
        url: post.url || '',
        likes: post.likesCount || 0,
        comments: post.commentsCount || 0,
        timestamp: post.timestamp || '',
        type: post.type || 'image',
        caption: (post.caption || '').slice(0, 120),
        displayUrl: post.displayUrl || ''
      };
    })
  };
}
