import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Search, ShoppingBag, Phone, MapPin, Sun, Moon, ShieldCheck, Plus,
  Pencil, Trash2, Eye, EyeOff, LogOut, X, Upload, Package, BarChart3,
  MessageCircle, Menu, CheckCircle2, AlertCircle, Download, RefreshCw
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const WA_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER || "963937532026").replace(/\D/g, "");
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const DEFAULT_CATEGORIES = ["موبايلات","إكسسوارات","أجهزة جديدة","أجهزة مستعملة","باقات ورصيد","قسم العروض 🔥","تابلت","راوترات وإنترنت","خدمات اتصالات","شرائح وأرقام","سماعات","ساعات ذكية","شواحن وكابلات","قطع تبديل","بطاقات ألعاب"];
const CURRENCIES = ["دولار أمريكي","ليرة تركية","ليرة سورية"];
const SYMBOLS = {"دولار أمريكي":"$","ليرة تركية":"₺","ليرة سورية":"ل.س"};
const blankProduct = {name:"",description:"",category:"موبايلات",brand:"",model:"",condition:"جديد",price:"",currency:"دولار أمريكي",stock:"1",status:"active",image_url:"",is_offer:false,warranty:"",ram:"",storage:"",color:""};

function money(value, currency) {
  const n = Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${n} ${SYMBOLS[currency] || currency || ""}`;
}
function waUrl(message) { return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`; }
function eventLog(type, productId = null) {
  if (!supabase) return;
  supabase.from("analytics_events").insert({event_type:type, product_id:productId}).then(() => {});
}
function formatDate(date) {
  try { return new Date(date).toLocaleDateString("ar"); } catch { return ""; }
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");
  const [condition, setCondition] = useState("الكل");
  const [sort, setSort] = useState("newest");
  const [dark, setDark] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminTab, setAdminTab] = useState("products");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankProduct);
  const [imageFile, setImageFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [stats, setStats] = useState([]);
  const [orders, setOrders] = useState([]);
  const [mobileMenu, setMobileMenu] = useState(false);

  const configured = Boolean(supabase);

  async function loadProducts() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    let request = supabase.from("products").select("*").order("created_at", {ascending:false});
    if (!session) request = request.eq("status", "active");
    const { data, error } = await request;
    if (error) setError("تعذر تحميل المنتجات. تأكد من إعداد قاعدة البيانات وسياساتها.");
    else setProducts(data || []);
    setLoading(false);
  }

  async function loadAdminData() {
    if (!supabase || !session) return;
    const [eventsResult, ordersResult] = await Promise.all([
      supabase.from("analytics_events").select("event_type,product_id,created_at,products(name)").order("created_at", {ascending:false}).limit(500),
      supabase.from("orders").select("*").order("created_at", {ascending:false}).limit(200)
    ]);
    if (!eventsResult.error) setStats(eventsResult.data || []);
    if (!ordersResult.error) setOrders(ordersResult.data || []);
  }

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { loadProducts(); }, [session]);

  useEffect(() => {
    if (session) loadAdminData();
  }, [session, adminTab]);

  const visibleProducts = useMemo(() => {
    let list = [...products];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(p => [p.name,p.description,p.brand,p.model,p.category].filter(Boolean).join(" ").toLowerCase().includes(q));
    if (category !== "الكل") list = list.filter(p => p.category === category);
    if (condition !== "الكل") list = list.filter(p => p.condition === condition);
    if (sort === "price-asc") list.sort((a,b) => Number(a.price)-Number(b.price));
    if (sort === "price-desc") list.sort((a,b) => Number(b.price)-Number(a.price));
    if (sort === "views") list.sort((a,b) => Number(b.views||0)-Number(a.views||0));
    if (sort === "newest") list.sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
    return list;
  }, [products, query, category, condition, sort]);

  function startAdd() {
    setEditing(null); setForm({...blankProduct}); setImageFile(null);
    document.getElementById("product-editor")?.scrollIntoView({behavior:"smooth"});
  }
  function startEdit(product) {
    setEditing(product.id);
    setForm({...blankProduct, ...product, price:String(product.price ?? ""), stock:String(product.stock ?? 0)});
    setImageFile(null);
    document.getElementById("product-editor")?.scrollIntoView({behavior:"smooth"});
  }

  async function signIn(e) {
    e.preventDefault(); setNotice(""); setBusy(true);
    const {error} = await supabase.auth.signInWithPassword({email, password});
    setBusy(false);
    if (error) setNotice("تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور وصلاحية حساب المالك.");
    else { setPassword(""); setNotice("تم تسجيل الدخول."); }
  }
  async function signOut() {
    await supabase.auth.signOut();
    setSession(null); setAdminOpen(false); setNotice("");
  }

  async function saveProduct(e) {
    e.preventDefault();
    if (!supabase || !session) return setNotice("يجب تسجيل الدخول كمالك أولًا.");
    setBusy(true); setNotice("");
    let image_url = form.image_url || "";
    try {
      if (imageFile) {
        const ext = imageFile.name.split(".").pop().toLowerCase();
        if (!["jpg","jpeg","png","webp","gif"].includes(ext)) throw new Error("ارفع صورة بصيغة JPG أو PNG أو WEBP أو GIF فقط.");
        if (imageFile.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميغابايت.");
        const path = `${crypto.randomUUID()}.${ext}`;
        const {error:uploadError} = await supabase.storage.from("product-images").upload(path, imageFile, {upsert:false, contentType:imageFile.type});
        if (uploadError) throw uploadError;
        const {data} = supabase.storage.from("product-images").getPublicUrl(path);
        image_url = data.publicUrl;
      }
      const payload = {
        name:form.name.trim(), description:form.description.trim(), category:form.category,
        brand:form.brand.trim(), model:form.model.trim(), condition:form.condition,
        price:Number(form.price), currency:form.currency, stock:Math.max(0, Number(form.stock||0)),
        status:form.status, image_url, is_offer:Boolean(form.is_offer),
        warranty:form.warranty.trim(), ram:form.ram.trim(), storage:form.storage.trim(), color:form.color.trim()
      };
      if (!payload.name || !Number.isFinite(payload.price) || payload.price < 0) throw new Error("أدخل اسم المنتج وسعرًا صحيحًا.");
      let result;
      if (editing) result = await supabase.from("products").update(payload).eq("id", editing);
      else result = await supabase.from("products").insert(payload);
      if (result.error) throw result.error;
      setNotice(editing ? "تم تحديث المنتج." : "تمت إضافة المنتج.");
      setForm({...blankProduct}); setEditing(null); setImageFile(null);
      await loadProducts(); await loadAdminData();
    } catch (err) {
      setNotice(err.message || "حدث خطأ أثناء حفظ المنتج.");
    } finally { setBusy(false); }
  }

  async function deleteProduct(product) {
    if (!confirm(`هل تريد حذف المنتج «${product.name}» نهائيًا؟ الأفضل إخفاؤه إذا كان مباعًا.`)) return;
    const {error} = await supabase.from("products").delete().eq("id", product.id);
    if (error) setNotice("تعذر حذف المنتج. قد تكون له سجلات مرتبطة.");
    else { setNotice("تم حذف المنتج."); await loadProducts(); }
  }
  async function toggleProduct(product) {
    const nextStatus = product.status === "active" ? "hidden" : "active";
    const {error} = await supabase.from("products").update({status:nextStatus}).eq("id", product.id);
    if (error) setNotice("تعذر تغيير حالة المنتج.");
    else { setNotice("تم تحديث حالة المنتج."); await loadProducts(); }
  }
  async function duplicateProduct(product) {
    const {id,created_at,updated_at,views,...copy} = product;
    const {error} = await supabase.from("products").insert({...copy,name:`${product.name} - نسخة`,views:0});
    if (error) setNotice("تعذر نسخ المنتج.");
    else { setNotice("تم نسخ المنتج."); await loadProducts(); }
  }

  async function openProduct(product) {
    eventLog("product_view", product.id);
    if (supabase) supabase.rpc("increment_product_view", {p_product_id:product.id}).then(()=>{});
  }
  function addToCart(product) {
    if (Number(product.stock) <= 0) return setNotice("هذا المنتج غير متوفر حاليًا.");
    setCart(prev => {
      const found = prev.find(x => x.id === product.id);
      if (found) return prev.map(x => x.id === product.id ? {...x, qty:Math.min(x.qty+1, Number(product.stock)||99)} : x);
      return [...prev, {...product, qty:1}];
    });
    setNotice("أُضيف المنتج إلى السلة.");
  }
  function changeQty(id, qty) {
    setCart(prev => prev.map(x => x.id === id ? {...x, qty:Math.max(1,Math.min(Number(qty)||1,Number(x.stock)||99))} : x));
  }
  async function sendCart() {
    if (!cart.length) return;
    const currency = cart[0].currency;
    const mixedCurrencies = cart.some(p => p.currency !== currency);
    const total = cart.reduce((sum,p)=>sum + Number(p.price)*p.qty,0);
    const code = `AH-${Date.now().toString().slice(-8)}`;
    const lines = cart.map(p => `• ${p.name} × ${p.qty} — ${money(Number(p.price)*p.qty,p.currency)}\n${location.origin}/?product=${p.id}`).join("\n");
    const message = `السلام عليكم، أريد الاستفسار عن الطلب ${code}\n${lines}\n${mixedCurrencies ? "الأسعار بعملات مختلفة، يرجى تأكيد المجموع." : `المجموع التقريبي: ${money(total,currency)}`}`;
    if (supabase) {
      try {
        const {data:order, error:orderError} = await supabase.from("orders").insert({
          order_code:code, status:"pending", total: Number(total.toFixed(2)),
          currency:mixedCurrencies ? "متعدد العملات" : currency,
          item_summary:cart.map(p=>`${p.name} × ${p.qty}`).join(" | ")
        }).select("id").single();
        if (!orderError && order) eventLog("order_created", null);
      } catch {}
    }
    eventLog("whatsapp_click");
    window.open(waUrl(message), "_blank", "noopener,noreferrer");
    setCart([]); setCartOpen(false);
  }

  function exportProducts() {
    const rows = [["name","description","category","brand","model","condition","price","currency","stock","status","image_url","is_offer","warranty","ram","storage","color"]];
    products.forEach(p => rows.push([p.name,p.description,p.category,p.brand,p.model,p.condition,p.price,p.currency,p.stock,p.status,p.image_url,p.is_offer,p.warranty,p.ram,p.storage,p.color]));
    const csv = "\uFEFF" + rows.map(row => row.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    const a = document.createElement("a"); a.href=url; a.download="alhassan-products.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const activeCount = products.length;
  const viewCount = stats.filter(e=>e.event_type==="product_view").length;
  const whatsappCount = stats.filter(e=>e.event_type==="whatsapp_click").length;
  const orderCount = stats.filter(e=>e.event_type==="order_created").length;

  return <div className={dark ? "app dark" : "app light"}>
    <div className="topline"><span>الحسن للاتصالات</span><span>الجودة الأفضل • معاملة جيدة</span></div>
    <header className="site-header">
      <button className="icon-btn mobile-menu" onClick={()=>setMobileMenu(!mobileMenu)} aria-label="القائمة"><Menu size={20}/></button>
      <a className="brand" href="#" onClick={()=>{setCategory("الكل");window.scrollTo({top:0,behavior:"smooth"});}}>
        <div className="brand-mark">ح</div>
        <div><strong>الحسن <em>للاتصالات</em></strong><small>كل ما تحتاجه لعالم الاتصالات متوفر</small></div>
      </a>
      <nav className={mobileMenu ? "main-nav open" : "main-nav"}>
        <button onClick={()=>{setCategory("الكل");setMobileMenu(false);}}>الرئيسية</button>
        <button onClick={()=>{document.getElementById("catalog")?.scrollIntoView({behavior:"smooth"});setMobileMenu(false);}}>المنتجات</button>
        <button onClick={()=>{setCategory("قسم العروض 🔥");document.getElementById("catalog")?.scrollIntoView({behavior:"smooth"});setMobileMenu(false);}}>العروض</button>
        <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer">اتصل بنا</a>
      </nav>
      <div className="header-actions">
        <button className="icon-btn" onClick={()=>setDark(!dark)} aria-label="تبديل المظهر">{dark?<Sun size={19}/>:<Moon size={19}/>}</button>
        <button className="cart-btn" onClick={()=>setCartOpen(true)}><ShoppingBag size={18}/> <span>السلة</span><b>{cart.reduce((s,p)=>s+p.qty,0)}</b></button>
      </div>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><span className="gold-dot"/> متجر الحسن للاتصالات</span>
          <h1>كل ما تحتاجه لعالم الاتصالات <span>متوفر</span></h1>
          <p>أسعار أقل، جودة أفضل، ومعاملة جيدة. تصفّح المنتجات واختر ما يناسبك، واستفسر مباشرة عبر واتساب.</p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={()=>document.getElementById("catalog")?.scrollIntoView({behavior:"smooth"})}>تصفح المنتجات <ShoppingBag size={17}/></button>
            <a className="secondary-btn" href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer"><MessageCircle size={17}/> تواصل معنا</a>
          </div>
          <div className="trust-row"><span><ShieldCheck size={16}/> خدمة موثوقة</span><span><Package size={16}/> منتجات متنوعة</span></div>
        </div>
        <div className="hero-art" aria-label="واجهة متجر الهواتف">
          <div className="art-ring ring-one"/><div className="art-ring ring-two"/>
          <div className="phone phone-back"><div className="camera-set"><i/><i/><i/></div></div>
          <div className="phone phone-front"><div className="screen-glow"><div className="screen-logo">ح</div><span>AL HASSAN</span><small>TELECOM</small></div><div className="dynamic-island"/></div>
          <div className="floating-tag tag-top">جودة أفضل <CheckCircle2 size={15}/></div>
          <div className="floating-tag tag-bottom"><span>عروض مميزة</span> <b>✦</b></div>
        </div>
      </section>

      <section className="benefits">
        <div><span className="benefit-icon"><ShieldCheck/></span><span><b>جودة موثوقة</b><small>اختيارات تناسب احتياجك</small></span></div>
        <div><span className="benefit-icon"><MessageCircle/></span><span><b>تواصل مباشر</b><small>استفسر عبر واتساب</small></span></div>
        <div><span className="benefit-icon"><Package/></span><span><b>أقسام متنوعة</b><small>كل احتياجات الاتصالات</small></span></div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading"><div><span className="eyebrow">تسوّق بسهولة</span><h2>اكتشف <span>منتجاتنا</span></h2><p>اختر القسم أو ابحث عن المنتج الذي تحتاجه.</p></div><div className="result-count">{visibleProducts.length} منتج</div></div>
        <div className="search-row">
          <div className="search-box"><Search size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن اسم المنتج أو الشركة أو الموديل..." /></div>
          <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="ترتيب المنتجات">
            <option value="newest">الأحدث أولًا</option><option value="price-asc">السعر: الأقل أولًا</option><option value="price-desc">السعر: الأعلى أولًا</option><option value="views">الأكثر مشاهدة</option>
          </select>
          <select value={condition} onChange={e=>setCondition(e.target.value)} aria-label="حالة المنتج">
            <option value="الكل">كل الحالات</option><option value="جديد">جديد</option><option value="مستعمل">مستعمل</option>
          </select>
        </div>
        <div className="category-row">
          {["الكل",...categories].filter((v,i,a)=>a.indexOf(v)===i).map(cat=><button key={cat} className={category===cat?"category-chip selected":"category-chip"} onClick={()=>setCategory(cat)}>{cat}</button>)}
        </div>
        {!configured && <div className="setup-warning"><AlertCircle/><div><b>الموقع جاهز للتجربة، لكنه غير مربوط بقاعدة البيانات بعد.</b><p>أكمل خطوات ملف README_AR.md لإظهار المنتجات وحفظها بشكل دائم.</p></div></div>}
        {error && <div className="notice error"><AlertCircle size={18}/>{error}</div>}
        {notice && <div className="notice"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}
        {loading ? <div className="empty-state"><RefreshCw className="spin"/><p>جاري تحميل المنتجات...</p></div> :
          visibleProducts.length ? <div className="product-grid">{visibleProducts.map(p=><article className="product-card" key={p.id}>
            <button className="product-image" onClick={()=>openProduct(p)} aria-label={`عرض ${p.name}`}>
              {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy"/> : <div className="placeholder"><Package size={42}/><span>صورة المنتج</span></div>}
              {p.is_offer && <span className="offer-badge">عرض خاص</span>}
              {p.condition==="مستعمل" && <span className="used-badge">مستعمل</span>}
            </button>
            <div className="product-info"><span className="product-category">{p.category}</span><h3>{p.name}</h3>{p.brand||p.model?<small className="muted">{[p.brand,p.model].filter(Boolean).join(" • ")}</small>:null}
              <p>{p.description || "للاستفسار عن التفاصيل والتوفر، تواصل معنا عبر واتساب."}</p>
              <div className="product-bottom"><div className="price">{money(p.price,p.currency)}{Number(p.stock)<=0&&<small className="out-label">نفد المخزون</small>}</div><span className="stock-label">{Number(p.stock)>0?`متوفر (${p.stock})`:"غير متوفر"}</span></div>
              <div className="product-actions"><button className="add-btn" disabled={Number(p.stock)<=0} onClick={()=>addToCart(p)}><Plus size={16}/> أضف للسلة</button><a className="wa-btn" href={waUrl(`السلام عليكم، أريد الاستفسار عن ${p.name}\nالسعر: ${money(p.price,p.currency)}\nرابط المنتج: ${location.origin}/?product=${p.id}`)} target="_blank" rel="noreferrer" onClick={()=>eventLog("whatsapp_click",p.id)}><MessageCircle size={16}/></a></div>
            </div>
          </article>)}</div> : <div className="empty-state"><Package size={38}/><h3>{configured?"لا توجد منتجات مطابقة":"أهلًا بك في متجر الحسن"}</h3><p>{configured?"جرّب تغيير البحث أو اختيار قسم آخر.":"بعد ربط قاعدة البيانات وإضافة المنتجات من لوحة المالك ستظهر هنا."}</p>{configured&&<button className="secondary-btn" onClick={()=>{setQuery("");setCategory("الكل");setCondition("الكل");}}>إظهار كل المنتجات</button>}</div>
        }
      </section>

      <section className="contact-band"><div><span className="eyebrow">نحن هنا لمساعدتك</span><h2>تحتاج مساعدة في اختيار منتج؟</h2><p>تواصل معنا وسنساعدك في معرفة التفاصيل والتوفر.</p></div><a className="primary-btn" href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> تواصل عبر واتساب</a></section>
    </main>

    <footer className="footer"><div className="footer-brand"><div className="brand-mark">ح</div><div><b>الحسن للاتصالات</b><small>كل ما تحتاجه لعالم الاتصالات متوفر</small></div></div><div className="footer-details"><span><MapPin size={16}/> قباسين، دوار السوق، جانب صيدلية الشهباء</span><a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/> واتساب: 0937532026</a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} الحسن للاتصالات</span><button onClick={()=>setAdminOpen(true)}><ShieldCheck size={15}/> دخول المالك</button></div></footer>

    {cartOpen && <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setCartOpen(false);}}><aside className="drawer"><div className="drawer-head"><h2><ShoppingBag/> سلة الاستفسار</h2><button className="icon-btn" onClick={()=>setCartOpen(false)}><X/></button></div>
      {cart.length ? <><div className="cart-items">{cart.map(p=><div className="cart-line" key={p.id}>{p.image_url?<img src={p.image_url} alt=""/>:<div className="mini-placeholder"><Package/></div>}<div className="cart-line-info"><b>{p.name}</b><small>{money(p.price,p.currency)}</small><div className="qty-control"><button onClick={()=>changeQty(p.id,p.qty-1)}>-</button><span>{p.qty}</span><button onClick={()=>changeQty(p.id,p.qty+1)}>+</button></div></div><button className="icon-btn danger" onClick={()=>setCart(prev=>prev.filter(x=>x.id!==p.id))}><Trash2 size={17}/></button></div>)}</div>
        <div className="cart-summary"><p>المجموع التقريبي</p><strong>{cart.every(p=>p.currency===cart[0].currency)?money(cart.reduce((s,p)=>s+Number(p.price)*p.qty,0),cart[0].currency):"الأسعار بعملات مختلفة"}</strong><small>السعر والتوفر النهائيان يؤكدهما المحل عبر واتساب.</small><button className="primary-btn full" onClick={sendCart}><MessageCircle size={18}/> إرسال الطلب عبر واتساب</button></div></>
        : <div className="empty-state"><ShoppingBag size={40}/><h3>سلتك فارغة</h3><p>أضف المنتجات التي تريد الاستفسار عنها.</p><button className="primary-btn" onClick={()=>setCartOpen(false)}>متابعة التسوق</button></div>}
    </aside></div>}

    {adminOpen && <div className="overlay admin-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAdminOpen(false);}}><section className="admin-modal">
      <div className="admin-head"><div><span className="eyebrow">منطقة محمية</span><h2><ShieldCheck/> لوحة المالك</h2></div><button className="icon-btn" onClick={()=>setAdminOpen(false)}><X/></button></div>
      {!configured ? <div className="setup-warning"><AlertCircle/><div><b>قاعدة البيانات غير مضبوطة</b><p>اتبع تعليمات README_AR.md لإضافة مفاتيح Supabase.</p></div></div> : !session ? <form className="login-form" onSubmit={signIn}><p>سجّل الدخول بحساب المالك الذي أنشأته في Supabase. لا يوجد تسجيل عام من هذه الصفحة.</p><label>البريد الإلكتروني</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/><label>كلمة المرور</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/><button className="primary-btn full" disabled={busy}>{busy?"جارٍ الدخول...":"تسجيل الدخول"}</button>{notice&&<div className="notice">{notice}</div>}</form> :
      <><div className="admin-toolbar"><button className={adminTab==="products"?"tab active":"tab"} onClick={()=>setAdminTab("products")}><Package size={16}/> المنتجات</button><button className={adminTab==="stats"?"tab active":"tab"} onClick={()=>setAdminTab("stats")}><BarChart3 size={16}/> الإحصائيات</button><button className={adminTab==="orders"?"tab active":"tab"} onClick={()=>setAdminTab("orders")}><ShoppingBag size={16}/> الطلبات</button><button className="tab" onClick={exportProducts}><Download size={16}/> تصدير CSV</button><button className="tab logout" onClick={signOut}><LogOut size={16}/> خروج</button></div>
      {adminTab==="products" && <div className="admin-content"><div className="admin-section-title"><h3>إدارة المنتجات</h3><button className="primary-btn small" onClick={startAdd}><Plus size={16}/> إضافة منتج</button></div>
        <form id="product-editor" className="product-form" onSubmit={saveProduct}><h4>{editing?"تعديل المنتج":"إضافة منتج جديد"}</h4><div className="form-grid">
          <label>اسم المنتج *<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>
          <label>القسم<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}<option>أخرى</option></select></label>
          <label>السعر *<input type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} required/></label>
          <label>العملة<select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{CURRENCIES.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>الحالة<select value={form.condition} onChange={e=>setForm({...form,condition:e.target.value})}><option>جديد</option><option>مستعمل</option></select></label>
          <label>الكمية المتوفرة<input type="number" min="0" step="1" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label>
          <label>الشركة<input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></label>
          <label>الموديل<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></label>
          <label>اللون<input value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/></label>
          <label>الضمان<input value={form.warranty} onChange={e=>setForm({...form,warranty:e.target.value})}/></label>
          <label>الذاكرة RAM<input value={form.ram} onChange={e=>setForm({...form,ram:e.target.value})}/></label>
          <label>مساحة التخزين<input value={form.storage} onChange={e=>setForm({...form,storage:e.target.value})}/></label>
          <label className="wide">وصف المنتج<textarea rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
          <label className="wide">صورة المنتج (حتى 5 ميغابايت)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>setImageFile(e.target.files?.[0]||null)}/>{form.image_url&&!imageFile&&<small>توجد صورة محفوظة؛ اختر صورة جديدة لاستبدالها.</small>}</label>
          <label className="check-label"><input type="checkbox" checked={Boolean(form.is_offer)} onChange={e=>setForm({...form,is_offer:e.target.checked})}/> وضع شارة «عرض خاص»</label>
          <label>ظهور المنتج<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">ظاهر للزوار</option><option value="hidden">مخفي</option></select></label>
        </div><div className="form-actions"><button className="primary-btn" disabled={busy}>{busy?"جارٍ الحفظ...":editing?"حفظ التعديلات":"حفظ المنتج"}</button><button type="button" className="secondary-btn" onClick={()=>{setEditing(null);setForm({...blankProduct});setImageFile(null);}}>تفريغ الحقول</button></div></form>
        <div className="admin-product-list"><h4>المنتجات الحالية ({products.length})</h4>{products.map(p=><div className="admin-product-row" key={p.id}>{p.image_url?<img src={p.image_url} alt=""/>:<div className="mini-placeholder"><Package/></div>}<div className="admin-product-name"><b>{p.name}</b><small>{money(p.price,p.currency)} • {p.category}</small></div><button className="icon-btn" title="تعديل" onClick={()=>startEdit(p)}><Pencil size={17}/></button><button className="icon-btn" title="إخفاء أو إظهار" onClick={()=>toggleProduct(p)}>{p.status==="active"?<EyeOff size={17}/>:<Eye size={17}/>}</button><button className="icon-btn" title="نسخ" onClick={()=>duplicateProduct(p)}><Plus size={17}/></button><button className="icon-btn danger" title="حذف" onClick={()=>deleteProduct(p)}><Trash2 size={17}/></button></div>)}</div>
      </div>}
      {adminTab==="stats" && <div className="admin-content"><div className="stats-grid"><div><Eye/><small>مشاهدات المنتجات المسجلة</small><strong>{viewCount}</strong></div><div><MessageCircle/><small>ضغطات واتساب المسجلة</small><strong>{whatsappCount}</strong></div><div><ShoppingBag/><small>طلبات الاستفسار المنشأة</small><strong>{orderCount}</strong></div><div><Package/><small>المنتجات النشطة المحملة</small><strong>{activeCount}</strong></div></div><h3>أحدث الأحداث</h3><div className="event-list">{stats.slice(0,100).map((e,i)=><div key={i}><span>{e.event_type==="product_view"?"مشاهدة منتج":e.event_type==="whatsapp_click"?"ضغط واتساب":e.event_type==="order_created"?"إنشاء طلب":"حدث"}</span><small>{e.products?.name||"—"}</small><time>{formatDate(e.created_at)}</time></div>)}</div><p className="muted">هذه أعداد للأحداث التي سجّلها الموقع ضمن البيانات المتاحة، وليست عدد أشخاص فريدين. لا نجمع بصمة الجهاز أو بيانات شخصية للزوار.</p></div>}
      {adminTab==="orders" && <div className="admin-content"><h3>طلبات الاستفسار</h3><p className="muted">الطلب هنا يعني أن السلة أُرسلت لفتح واتساب، ولا يعني أن البيع تم أو أن الزبون أرسل الرسالة بالفعل.</p>{orders.length?orders.map(o=><div className="order-row" key={o.id}><div><b>{o.order_code}</b><p>{o.item_summary||"تفاصيل غير متوفرة"}</p><small>{formatDate(o.created_at)} • {money(o.total,o.currency)}</small></div><select value={o.status} onChange={async e=>{const value=e.target.value;const {error}=await supabase.from("orders").update({status:value}).eq("id",o.id);if(!error)setOrders(prev=>prev.map(x=>x.id===o.id?{...x,status:value}:x));}}><option value="pending">بانتظار التواصل</option><option value="confirmed">بيع مؤكد</option><option value="cancelled">ملغى</option></select></div>):<div className="empty-state"><ShoppingBag/><p>لا توجد طلبات مسجلة حتى الآن.</p></div>}</div>}
      {notice&&<div className="notice"><CheckCircle2 size={18}/>{notice}<button onClick={()=>setNotice("")}><X size={15}/></button></div>}</>}
    </section></div>}
    <a className="floating-wa" href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noreferrer" aria-label="تواصل عبر واتساب"><MessageCircle size={23}/></a>
  </div>;
}