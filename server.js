import express from "express";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import path from "node:path";

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "50kb" }));

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
const missing = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","ADMIN_USERNAME","ADMIN_PASSWORD","SESSION_SECRET"].filter(k => !process.env[k]);
if (missing.length) {
  console.error("Missing environment variables:", missing.join(", "));
  process.exit(1);
}
if (SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters.");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf","image/jpeg","image/png","image/webp"];
    cb(allowed.includes(file.mimetype) ? null : new Error("শুধু PDF, JPG, PNG বা WebP ফাইল দেওয়া যাবে।"), allowed.includes(file.mimetype));
  }
});
const statuses = ["নতুন অর্ডার","যাচাই চলছে","প্রিন্টিং চলছে","ডেলিভারির জন্য প্রস্তুত","পাঠানো হয়েছে","সম্পন্ন","বাতিল"];
const safeEqual = (a,b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa,bb);
};
function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now()+8*60*60*1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
function validToken(token="") {
  const [payload,sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (!safeEqual(sig, expected)) return false;
  try { return JSON.parse(Buffer.from(payload,"base64url").toString()).exp > Date.now(); } catch { return false; }
}
function admin(req,res,next) {
  const token = (req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith("dps_admin="))?.slice(10);
  if (!validToken(token)) return res.status(401).json({error:"অ্যাডমিন হিসেবে লগইন করুন।"});
  next();
}
const orderLimiter = rateLimit({ windowMs: 15*60*1000, limit: 8, standardHeaders: "draft-8", legacyHeaders: false,
  message: {error:"অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।"} });
app.use(express.static("public", { extensions:["html"] }));

app.get("/api/health", (_req,res)=>res.json({ok:true}));
app.post("/api/orders", orderLimiter, upload.single("file"), async (req,res) => {
  try {
    const b=req.body||{};
    const required=["name","phone","printType","paper","copies","delivery","address","payment"];
    if (required.some(k=>!String(b[k]||"").trim()) || !req.file) return res.status(400).json({error:"সব প্রয়োজনীয় তথ্য ও ফাইল দিন।"});
    const copies=Number(b.copies);
    if (!Number.isInteger(copies)||copies<1||copies>10000) return res.status(400).json({error:"কপি সংখ্যা ১ থেকে ১০,০০০-এর মধ্যে হতে হবে।"});
    if (String(b.name).length>100 || String(b.phone).length>30 || String(b.address).length>1000) return res.status(400).json({error:"কোনো তথ্যের দৈর্ঘ্য বেশি হয়েছে।"});
    const ext = ({ "application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp" })[req.file.mimetype];
    const publicId="DPS-"+crypto.randomBytes(4).toString("hex").toUpperCase();
    const storagePath=`${new Date().toISOString().slice(0,10)}/${publicId}.${ext}`;
    const {error:upErr}=await supabase.storage.from("order-files").upload(storagePath,req.file.buffer,{contentType:req.file.mimetype,upsert:false});
    if(upErr) throw upErr;
    const row={
      public_id:publicId, name:String(b.name).trim(), phone:String(b.phone).trim(),
      print_type:String(b.printType), paper_size:String(b.paper), copies,
      delivery:String(b.delivery), address:String(b.address).trim(), payment:String(b.payment),
      trx_id:String(b.trx||"").trim().slice(0,120), notes:String(b.notes||"").trim().slice(0,2000),
      file_name:path.basename(req.file.originalname).slice(0,180), storage_path:storagePath
    };
    const {error:dbErr}=await supabase.from("shop_orders").insert(row);
    if(dbErr){ await supabase.storage.from("order-files").remove([storagePath]); throw dbErr; }
    res.status(201).json({orderId:publicId});
  } catch(err) {
    console.error("Order error:",err.message);
    res.status(500).json({error:"অর্ডার জমা হয়নি। সার্ভার সেটআপ ও ফাইলের Bucket পরীক্ষা করুন।"});
  }
});
app.get("/api/track/:id", async (req,res)=>{
  const id=String(req.params.id).toUpperCase().trim();
  const {data,error}=await supabase.from("shop_orders").select("public_id,status,created_at").eq("public_id",id).maybeSingle();
  if(error) return res.status(500).json({error:"তথ্য পাওয়া যায়নি।"});
  if(!data) return res.status(404).json({error:"এই অর্ডার নম্বর পাওয়া যায়নি।"});
  res.json(data);
});
app.post("/api/admin/login", rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:"draft-8",legacyHeaders:false}), (req,res)=>{
  if(!safeEqual(req.body?.username||"",ADMIN_USERNAME)||!safeEqual(req.body?.password||"",ADMIN_PASSWORD)) return res.status(401).json({error:"ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।"});
  res.cookie("dps_admin",makeToken(),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:8*60*60*1000,path:"/"});
  res.json({ok:true});
});
app.get("/api/admin/me",admin,(_req,res)=>res.json({loggedIn:true}));
app.post("/api/admin/logout",(req,res)=>{res.clearCookie("dps_admin",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});res.json({ok:true});});
app.get("/api/admin/orders",admin,async(_req,res)=>{
  const {data,error}=await supabase.from("shop_orders").select("*").order("created_at",{ascending:false}).limit(300);
  if(error) return res.status(500).json({error:"অর্ডার তালিকা লোড হয়নি।"});
  res.json(data||[]);
});
app.patch("/api/admin/orders/:id/status",admin,async(req,res)=>{
  if(!statuses.includes(req.body?.status)) return res.status(400).json({error:"স্ট্যাটাস সঠিক নয়।"});
  const {error}=await supabase.from("shop_orders").update({status:req.body.status}).eq("public_id",String(req.params.id).toUpperCase());
  if(error) return res.status(500).json({error:"স্ট্যাটাস আপডেট হয়নি।"});
  res.json({ok:true});
});
app.get("/api/admin/orders/:id/file",admin,async(req,res)=>{
  const {data,error}=await supabase.from("shop_orders").select("storage_path,file_name").eq("public_id",String(req.params.id).toUpperCase()).maybeSingle();
  if(error||!data) return res.status(404).send("ফাইল পাওয়া যায়নি।");
  const {data:link,error:linkErr}=await supabase.storage.from("order-files").createSignedUrl(data.storage_path,60);
  if(linkErr||!link?.signedUrl) return res.status(500).send("ডাউনলোড লিংক তৈরি হয়নি।");
  res.redirect(link.signedUrl);
});
app.use((err,_req,res,_next)=>{
  console.error(err.message);
  res.status(err instanceof multer.MulterError ? 400 : 500).json({error:err.message||"সার্ভারে সমস্যা হয়েছে।"});
});
const port=process.env.PORT||3000;
app.listen(port,()=>console.log(`Design Printing Shop listening on ${port}`));
