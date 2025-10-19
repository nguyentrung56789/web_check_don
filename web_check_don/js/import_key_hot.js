{
  "cleanUrls": true,
  "rewrites": [
    { "source": "/check_don", "destination": "/check_don.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=600" }]
    }
  ]
}
