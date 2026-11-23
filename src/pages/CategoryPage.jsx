import { useState } from 'react'
import { Icon } from './Home'
import { matchesProductCategory } from '../data/productSearch'
import { whatsappLink } from '../data/whatsapp'
import ProductForm from './ProductForm'

export default function CategoryPage({ title, eyebrow, category, products, search, recommended, isAdmin, onProductCreated }) {
  const [addingProduct, setAddingProduct] = useState(false)
  const filtered = products.filter((product) => matchesProductCategory(product, category))
  const productCategory = category
  return (
    <section className="shop-section">
      <div className="section-heading">
        <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
        {isAdmin && <button className="admin-add-button" onClick={() => setAddingProduct(!addingProduct)}>{addingProduct ? 'Close form' : '+ Add product'}</button>}
      </div>
      {search && recommended && <p className="search-note">No exact match for “{search}” — here are a few products you might like.</p>}
      {addingProduct && <ProductForm category={productCategory} onSaved={(product) => { onProductCreated(product); setAddingProduct(false) }} onCancel={() => setAddingProduct(false)} />}
      {filtered.length === 0 && <p className="empty-product-state">{search ? 'No products found. Try a different search.' : 'No products available in this section yet.'}</p>}
      <div className="product-grid page-product-grid">
        {filtered.map((product) => (
          <article className="product-card" id={`product-${product.id}`} key={product.id}>
            <div className="product-image">
              {Number(product.discountPercent) > 0
                ? <span className="badge sale-badge">{Number(product.discountPercent)}% OFF</span>
                : product.badge && <span className="badge">{product.badge}</span>}
              <img src={product.image} alt={product.name}/>
              <a className="quick-add" href={whatsappLink(`Hi, I'm interested in ${product.name}.`)} target="_blank" rel="noreferrer">Go to WhatsApp <span>↗</span></a>
            </div>
            <div className="product-info">
              <p>{product.category} · {product.amount || product.format}</p><h3>{product.name}</h3>
              {product.description && <p className="product-description">{product.description}</p>}
              <div className="rating"><Icon name="star" size={14}/><strong>{product.rating}</strong><span>({product.reviews})</span></div>
              <div className="price">{product.oldPrice != null && <del>${Number(product.oldPrice).toFixed(2)}</del>}<strong>${Number(product.price).toFixed(2)}</strong></div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
