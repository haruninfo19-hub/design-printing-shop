# ডিজাইন ও প্রিন্টিং শপ

Node.js + Express + Supabase (Postgres + private Storage) ভিত্তিক ওয়েবসাইট ও ইনস্টলযোগ্য PWA।

## Supabase সেটআপ
1. Supabase Dashboard → SQL Editor → `supabase_setup.sql`-এর SQL রান করুন।
2. Storage → `order-files` bucket আছে এবং **Private** আছে নিশ্চিত করুন।
3. Project Settings → API Keys থেকে server-side `service_role` / `secret` key নিন। এটি শুধু Render-এর Environment Variables-এ দিন; GitHub-এ বা ব্রাউজারে কখনো দেবেন না।

## Render সেটআপ
- New → Web Service → GitHub repository connect
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`
- `SESSION_SECRET`-এ অন্তত ৩২ অক্ষরের র‍্যান্ডম মান দিন।
- `ADMIN_PASSWORD` শক্তিশালী ও আলাদা রাখুন।

## বৈশিষ্ট্য
- PDF/JPG/PNG/WebP আপলোড (সর্বোচ্চ ২০ MB)
- Supabase private Storage-এ ফাইল
- Supabase `shop_orders` টেবিলে অর্ডার
- অর্ডার নম্বর দিয়ে ট্র্যাকিং
- অ্যাডমিন লগইন, অর্ডার দেখা, ফাইল ডাউনলোড, স্ট্যাটাস পরিবর্তন
- PWA install prompt ও basic offline shell

## নিরাপত্তা
`SUPABASE_SERVICE_ROLE_KEY` অত্যন্ত সংবেদনশীল। এটি কেবল server environment variable-এ রাখুন। Public/publishable key এই সার্ভার অ্যাপের জন্য প্রয়োজন নেই। পুরোনো `public.orders` টেবিল পরিবর্তন করা হয়নি; নতুন `public.shop_orders` টেবিল ব্যবহৃত হচ্ছে।
