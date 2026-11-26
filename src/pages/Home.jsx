import { defaultCollectionImages } from '../data/collectionImages'
import { whatsappLink } from '../data/whatsapp'
import { matchesProductCategory } from '../data/productSearch'

export function Icon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function Home({ products = [], collectionImages = defaultCollectionImages }) {
  const promotionProducts = products.filter((product) => matchesProductCategory(product, 'Promotion Products'))
  const sections = [
    { id: 'hairloss', category: 'Hairloss', eyebrow: 'Hair + scalp support', title: 'Hairloss Solutions' },
    { id: 'vitamins', category: 'Vitamins', eyebrow: 'Everyday essentials', title: 'Vitamins & Wellness' },
    { id: 'supplement', category: 'Supplements', eyebrow: 'Train stronger', title: 'Supplement Products' },
    { id: 'other-products', category: 'Other Products', eyebrow: 'Explore everything', title: 'Other Products' },
  ]

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {promotionProducts.length > 0 && (
        <section id="sales-product" className="shop-section promotion-section" aria-label="Sales Product">
          <div className="section-heading">
            <div><h2>Sales Product</h2></div>
          </div>
          <div className="product-grid">
            {promotionProducts.map((product) => (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  {Number(product.discountPercent) > 0
                    ? <span className="badge sale-badge">{Number(product.discountPercent)}% OFF</span>
                    : product.badge && <span className="badge">{product.badge}</span>}
                  <img src={product.image} alt={product.name}/>
                  <a className="quick-add" href={whatsappLink(`Hi, I'm interested in ${product.name}.`)} target="_blank" rel="noreferrer">Go to WhatsApp <span>↗</span></a>
                </div>
                <div className="product-info">
                  <p>{product.amount || product.format}</p>
                  <h3>{product.name}</h3>
                  {product.description && <p className="product-description">{product.description}</p>}
                  <div className="price">{product.oldPrice != null && <del>${Number(product.oldPrice).toFixed(2)}</del>}<strong>${Number(product.price).toFixed(2)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="collections-section" aria-label="Shop by collection">
        <div className="collections-heading"><p className="eyebrow">Shop your goals</p><h2>Find your daily formula</h2></div>
        <div className="collection-grid">
          <button className="collection-card collection-hair" onClick={() => scrollToSection('hairloss')}><img src={collectionImages.hair} alt="Hair care"/><div><p>Hair + scalp support</p><h3>Hair Loss<br/>Solutions</h3><span>Explore formulas →</span></div></button>
          <button className="collection-card collection-vitamins" onClick={() => scrollToSection('vitamins')}><img src={collectionImages.vitamins} alt="Vitamins"/><div><p>Everyday essentials</p><h3>Vitamins &<br/>Wellness</h3><span>Shop vitamins →</span></div></button>
          <button className="collection-card collection-body" onClick={() => scrollToSection('supplement')}><img src={collectionImages.bodybuilder} alt="Bodybuilder"/><div><p>Train stronger</p><h3>Supplement<br/>Products</h3><span>Build your stack →</span></div></button>
          <button className="collection-card collection-bestsellers" onClick={() => scrollToSection('other-products')}><img src={collectionImages.otherProducts} alt="Fresh fruit"/><div><p>Explore everything</p><h3>Other<br/>Products</h3><span>Shop the range →</span></div></button>
        </div>
      </section>
      {sections.map((section) => {
        const sectionProducts = products.filter((product) => matchesProductCategory(product, section.category))
        return (
          <section id={section.id} className="shop-section home-category-section" aria-label={section.title} key={section.id}>
            <div className="section-heading">
              <div><p className="eyebrow">{section.eyebrow}</p><h2>{section.title}</h2></div>
            </div>
            {sectionProducts.length === 0 && <p className="empty-product-state">No products available in this section yet.</p>}
            <div className="product-grid">
              {sectionProducts.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    {product.badge && <span className="badge">{product.badge}</span>}
                    <img src={product.image} alt={product.name}/>
                    <a className="quick-add" href={whatsappLink(`Hi, I'm interested in ${product.name}.`)} target="_blank" rel="noreferrer">Go to WhatsApp <span>↗</span></a>
                  </div>
                  <div className="product-info">
                    <p>{product.category} · {product.amount || product.format}</p>
                    <h3>{product.name}</h3>
                    {product.description && <p className="product-description">{product.description}</p>}
                    <div className="price"><strong>${Number(product.price).toFixed(2)}</strong>{product.oldPrice && <del>${product.oldPrice}</del>}</div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}
