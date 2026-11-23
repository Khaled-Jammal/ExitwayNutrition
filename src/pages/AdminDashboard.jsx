import { useState } from 'react'
import { matchesProductCategory } from '../data/productSearch'
import { readApiResponse } from '../data/readApiResponse'
import ProductForm from './ProductForm'
import CollectionImagesForm from './CollectionImagesForm'

const sections = [
  { category: 'Hairloss', title: 'Hairloss' },
  { category: 'Vitamins', title: 'Vitamins' },
  { category: 'Supplements', title: 'Supplements / Bodybuilding' },
  { category: 'Other Products', title: 'Other products' },
  { category: 'Promotion Products', title: 'Sales Product' },
]

function isInSection(product, category) {
  return matchesProductCategory(product, category)
}

function ProductActionIcon({ type }) {
  return type === 'edit'
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>
}

export default function AdminDashboard({ products, collectionImages, onCollectionImageUpdated, onProductCreated, onProductUpdated, onProductDeleted, onLogout }) {
  const [activeForm, setActiveForm] = useState(null)
  const [logoutError, setLogoutError] = useState('')
  const [productError, setProductError] = useState('')

  function addProduct(product) {
    onProductCreated(product)
    setActiveForm(null)
  }

  function updateProduct(product, warning) {
    onProductUpdated(product)
    setProductError(warning || '')
    setActiveForm(null)
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return
    setProductError('')
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' })
      const result = await readApiResponse(response)
      onProductDeleted(product.id)
      setProductError(result.warning || '')
      setActiveForm((current) => current?.product?.id === product.id ? null : current)
    } catch (error) {
      setProductError(error.message || 'Unable to delete product.')
    }
  }

  async function signOut() {
    setLogoutError('')
    try {
      await onLogout()
    } catch (error) {
      setLogoutError(error.message || 'Unable to sign out. Please try again.')
    }
  }

  return (
    <section className="admin-dashboard">
      <div className="admin-heading">
        <div><p className="eyebrow">ExitWay store</p><h1>Admin dashboard</h1></div>
        <button className="text-button" onClick={signOut}>Sign out</button>
      </div>
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      {productError && <p className="form-error" role="alert">{productError}</p>}
      <div className="admin-summary">
        <article><span>Total products</span><strong>{products.length}</strong></article>
        <article><span>Product sections</span><strong>{sections.length}</strong></article>
      </div>
      <section className="admin-section admin-collection-settings">
        <div className="admin-section-heading">
          <div><h2>Shop your goals photos</h2><p>Change images in “Find your daily formula” on the home page</p></div>
        </div>
        <CollectionImagesForm images={collectionImages} onImageUpdated={onCollectionImageUpdated}/>
      </section>
      <div className="admin-sections">
        {sections.map((section) => {
          const sectionProducts = products.filter((product) => isInSection(product, section.category))
          const sectionForm = activeForm?.category === section.category ? activeForm : null
          return (
            <section className="admin-section" key={section.category}>
              <div className="admin-section-heading">
                <div><h2>{section.title}</h2><p>{sectionProducts.length} products</p></div>
                <button className="admin-add-button" onClick={() => setActiveForm(sectionForm ? null : { category: section.category })}>{sectionForm ? 'Close form' : '+ Add product'}</button>
              </div>
              {sectionForm && <ProductForm key={sectionForm.product?.id || section.category} category={section.category} product={sectionForm.product} onSaved={sectionForm.product ? updateProduct : addProduct} onCancel={() => setActiveForm(null)} />}
              {sectionProducts.length > 0 && (
                <div className="admin-product-list">
                  {sectionProducts.map((product) => (
                    <article className="admin-product-row" key={product.id}>
                      <img src={product.image} alt=""/>
                      <div><strong>{product.name}</strong><small>{product.amount || product.format}{product.description ? ` - ${product.description}` : ''}</small></div>
                      <b>${Number(product.price).toFixed(2)}</b>
                      <div className="admin-row-actions">
                        <button className="product-action-button" onClick={() => setActiveForm({ category: section.category, product })} aria-label={`Edit ${product.name}`} title="Edit product"><ProductActionIcon type="edit"/></button>
                        <button className="product-action-button delete" onClick={() => deleteProduct(product)} aria-label={`Delete ${product.name}`} title="Delete product"><ProductActionIcon type="delete"/></button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
