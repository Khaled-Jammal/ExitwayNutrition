import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { searchProducts } from './data/productSearch'
import { defaultCollectionImages } from './data/collectionImages'
import { readApiResponse } from './data/readApiResponse'
import brandLogo from './assets/exitway name logo.jpeg'
import Home, { Icon } from './pages/Home'
import CategoryPage from './pages/CategoryPage'
import Hairloss from './pages/Hairloss'
import Vitamins from './pages/Vitamins'
import Supplement from './pages/Supplement'
import OtherProducts from './pages/OtherProducts'
import AccountPage from './pages/AccountPage'
import AdminDashboard from './pages/AdminDashboard'

function HeaderIcon({ name, size = 18 }) {
  const paths = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    hair: <><path d="M7 18c-2-3-1-7 2-9 2-1 2-4 5-5 1 3 5 4 5 8 0 4-3 7-7 7"/><path d="M8 18c2-1 3-3 3-6"/><path d="M15 8c-1 3-1 6 1 9"/></>,
    pills: <><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="M8 10.5l8 5.5"/></>,
    gym: <><path d="M2 12h20"/><path d="M5 9v6M19 9v6"/><path d="M2 10v4M22 10v4"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [products, setProducts] = useState([])
  const [collectionImages, setCollectionImages] = useState(defaultCollectionImages)
  const [dataError, setDataError] = useState('')
  const [supabaseStatus, setSupabaseStatus] = useState('checking')
  const [supabaseWritesEnabled, setSupabaseWritesEnabled] = useState(false)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [adminConfigured, setAdminConfigured] = useState(false)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [pendingSearchProductId, setPendingSearchProductId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [page, setPage] = useState(() => window.location.hash.slice(1) || 'home')

  useEffect(() => {
    const handleHash = () => setPage(window.location.hash.slice(1) || 'home')
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  useEffect(() => {
    const sections = document.querySelectorAll('main section, footer')
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sections.forEach((section) => section.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })

    sections.forEach((section) => {
      section.classList.add('reveal-on-scroll')
      observer.observe(section)
    })
    return () => observer.disconnect()
  }, [page])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/products', { cache: 'no-store' }).then(readApiResponse),
      fetch('/api/site-settings', { cache: 'no-store' }).then(readApiResponse),
      fetch('/api/health', { cache: 'no-store' }).then(readApiResponse),
    ])
      .then(([productResult, settingsResult, healthResult]) => {
        if (!Array.isArray(productResult)) throw new Error('Supabase returned an invalid products response.')
        if (healthResult.database !== 'connected') throw new Error('The Supabase database connection was not confirmed.')
        if (cancelled) return
        setProducts(productResult)
        if (settingsResult.collectionImages && typeof settingsResult.collectionImages === 'object') {
          setCollectionImages((current) => ({
            hair: settingsResult.collectionImages.hair || current.hair,
            vitamins: settingsResult.collectionImages.vitamins || current.vitamins,
            bodybuilder: settingsResult.collectionImages.bodybuilder || current.bodybuilder,
            otherProducts: settingsResult.collectionImages.otherProducts || current.otherProducts,
          }))
        }
        setSupabaseWritesEnabled(Boolean(healthResult.writesEnabled))
        setSupabaseStatus('connected')
      })
      .catch((error) => {
        console.error('Unable to load data from Supabase.', error)
        if (!cancelled) {
          setDataError(error.message || 'Unable to load data from Supabase.')
          setSupabaseStatus('error')
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me')
      .then((response) => {
        if (!response.ok) throw new Error(`Account request failed: ${response.status}`)
        return response.json()
      })
      .then((result) => {
        if (cancelled) return
        setUser(result.user)
        setAdminConfigured(Boolean(result.adminConfigured))
        setSupabaseWritesEnabled(Boolean(result.supabaseWritesEnabled))
      })
      .catch((error) => {
        console.error('Unable to check the current account.', error)
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => { cancelled = true }
  }, [])

  function navigate(nextPage) {
    window.location.hash = nextPage
    setPage(nextPage)
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }

  function navigateToHomeSection(sectionId) {
    setMenuOpen(false)
    if (page !== 'home') {
      window.location.hash = 'home'
      setPage('home')
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      return
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const searchResult = useMemo(() => searchProducts(products, search), [products, search])
  const suggestions = searchResult.products.slice(0, 5)

  useEffect(() => {
    if (page !== 'search' || pendingSearchProductId === null) return

    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`product-${pendingSearchProductId}`)
      if (card) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
        card.classList.remove('search-result-target')
        void card.offsetWidth
        card.classList.add('search-result-target')
        card.addEventListener('animationend', () => card.classList.remove('search-result-target'), { once: true })
      }
      setPendingSearchProductId(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [page, pendingSearchProductId, searchResult.products])

  const pageProps = {
    products: searchResult.products,
    search,
    recommended: searchResult.recommended,
    isAdmin: user?.role === 'admin',
    onProductCreated: (product) => setProducts((current) => [product, ...current]),
  }
  let activePage
  if (page === 'search') activePage = <CategoryPage {...pageProps} title="Search results" eyebrow="Product search" category="All"/>
  else if (page === 'hairloss') activePage = <Hairloss {...pageProps}/>
  else if (page === 'vitamins') activePage = <Vitamins {...pageProps}/>
  else if (page === 'supplement') activePage = <Supplement {...pageProps}/>
  else if (page === 'other-products') activePage = <OtherProducts {...pageProps}/>
  else if (page === 'account') activePage = <AccountPage user={user} adminConfigured={adminConfigured} onAuth={handleAuth} onLogout={handleLogout} onNavigate={navigate}/>
  else if (page === 'admin') {
    activePage = !authReady
      ? <section className="account-page"><p>Checking admin access...</p></section>
      : user?.role === 'admin'
        ? <AdminDashboard
            products={products}
            collectionImages={collectionImages}
            supabaseWritesEnabled={supabaseWritesEnabled}
            onCollectionImageUpdated={(key, image) => setCollectionImages((current) => ({ ...current, [key]: image }))}
            onProductCreated={pageProps.onProductCreated}
            onProductUpdated={(updated) => setProducts((current) => current.map((product) => String(product.id) === String(updated.id) ? updated : product))}
            onProductDeleted={(id) => setProducts((current) => current.filter((product) => String(product.id) !== String(id)))}
            onLogout={handleLogout}
          />
        : <AccountPage user={user} adminConfigured={adminConfigured} onAuth={handleAuth} onLogout={handleLogout} onNavigate={navigate}/>
  }
  else activePage = <Home products={products} isAdmin={user?.role === 'admin'} onProductCreated={pageProps.onProductCreated} collectionImages={collectionImages}/>

  function handleAuth(nextUser) {
    setUser(nextUser)
    navigate(nextUser.role === 'admin' ? 'admin' : 'home')
  }

  async function handleLogout() {
    const response = await fetch('/api/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('Unable to sign out. Please try again.')
    setUser(null)
    navigate('home')
  }

  function chooseSuggestion(product) {
    setSearch(product.name)
    setPendingSearchProductId(product.id)
    setSearchFocused(false)
    navigate('search')
  }

  function submitSearch(event) {
    event.preventDefault()
    if (!search.trim()) return
    setSearchFocused(false)
    if (!searchResult.recommended && suggestions[0]) {
      chooseSuggestion(suggestions[0])
      return
    }
    setPendingSearchProductId(null)
    navigate('search')
  }

  return (
    <div className={`app theme-${page}`}>
      <header className="header">
        <button className="icon-button menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu"><Icon name="menu"/></button>
        <button className="brand" onClick={() => navigate('home')} aria-label="ExitWay Nutrition home"><img className="brand-logo" src={brandLogo} alt=""/><span>EXITWAY</span></button>
        <nav className={menuOpen ? 'nav open' : 'nav'} aria-label="Main navigation">
          <button className={page === 'home' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('home')}><HeaderIcon name="home"/><span>Home</span></button>
          <button className={page === 'home' ? 'nav-link' : 'nav-link'} onClick={() => navigateToHomeSection('hairloss')}><HeaderIcon name="hair"/><span>Hairloss</span></button>
          <button className={page === 'home' ? 'nav-link' : 'nav-link'} onClick={() => navigateToHomeSection('vitamins')}><HeaderIcon name="pills"/><span>Vitamins</span></button>
          <button className={page === 'home' ? 'nav-link' : 'nav-link'} onClick={() => navigateToHomeSection('supplement')}><HeaderIcon name="gym"/><span>Supplement</span></button>
          <button className={page === 'home' ? 'nav-link' : 'nav-link'} onClick={() => navigateToHomeSection('other-products')}><span>Other Products</span></button>
        </nav>
        <div className="header-actions">
          <form className="search-box" onSubmit={submitSearch}>
            <button className="search-submit" type="submit" aria-label="Search products" disabled={!search.trim()}>
              <Icon name="search" size={18}/>
            </button>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearchFocused(false)
              }}
              placeholder="Search products"
              aria-label="Search products"
              aria-expanded={searchFocused && suggestions.length > 0}
              aria-controls="search-suggestions"
            />
            {searchFocused && search.trim() && suggestions.length > 0 && (
              <div className="search-suggestions" id="search-suggestions" role="listbox" aria-label="Product suggestions">
                <p>{searchResult.recommended ? 'You might like' : 'Products'}</p>
                {suggestions.map((product) => (
                  <button type="button" key={product.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(product)} role="option">
                    <span>{product.name}</span><small>{product.category}</small>
                  </button>
                ))}
              </div>
            )}
          </form>
          <button
            className={`admin-login-icon${page === 'account' || page === 'admin' ? ' active' : ''}`}
            onClick={() => navigate(user?.role === 'admin' ? 'admin' : 'account')}
            aria-label={user?.role === 'admin' ? 'Admin dashboard' : 'Admin login'}
            title={user?.role === 'admin' ? 'Admin dashboard' : 'Admin login'}
          >
            <HeaderIcon name="account" size={17}/>
          </button>
        </div>
      </header>

      <main>
        {supabaseStatus === 'checking' && <p className="connection-status" role="status">Checking Supabase connection...</p>}
        {supabaseStatus === 'error' && <p className="connection-status error" role="alert">Supabase data is unavailable: {dataError}</p>}
        {supabaseStatus === 'connected' && !supabaseWritesEnabled && user?.role === 'admin' && (
          <p className="connection-status warning" role="status">Supabase is connected in read-only mode. Configure the server-side secret key to enable admin edits and image uploads.</p>
        )}
        {activePage}
      </main>

      <footer>
        <div className="footer-main">
          <button className="brand footer-brand" onClick={() => navigate('home')}><img className="brand-logo" src={brandLogo} alt=""/><span>EXITWAY</span></button>
          <p>Nutrition for real life.</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <button onClick={() => navigate('home')}>Home</button>
          <button onClick={() => navigateToHomeSection('hairloss')}>Hairloss</button>
          <button onClick={() => navigateToHomeSection('vitamins')}>Vitamins</button>
          <button onClick={() => navigateToHomeSection('supplement')}>Supplement</button>
          <button onClick={() => navigateToHomeSection('other-products')}>Other products</button>
          <button onClick={() => navigate(user?.role === 'admin' ? 'admin' : 'account')}>{user?.role === 'admin' ? 'Admin dashboard' : 'Admin login'}</button>
        </nav>
        <div className="footer-contact">
          <a href="tel:+96181712946">+961 81 712 946</a>
          <a href="mailto:mimo@gmail.com">mimo@gmail.com</a>
        </div>
        <small>© 2026 ExitWay Nutrition</small>
        <p className="footer-credit">This website created by Khaled Jammal. <a href="tel:+96170975519">For more info</a></p>
      </footer>

    </div>
  )
}

export default App
