import { Hono } from "hono";
import { html } from "hono/html";

export function createLandingRoutes() {
  const app = new Hono();

  app.get("/", (c) => {
    return c.html(
      html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Brew Haven - Artisan coffee shop serving premium espresso, cappuccino, and specialty drinks. Visit us for exceptional coffee and a welcoming atmosphere.">
  <meta name="keywords" content="coffee shop, espresso, cappuccino, artisan coffee, specialty drinks, cafe">
  <meta name="author" content="Brew Haven">
  <title>Brew Haven - Artisan Coffee Shop</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 20px;
    }

    /* Navigation */
    nav {
      background: #2c1810;
      color: #fff;
      padding: 1rem 0;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }

    nav .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: bold;
      color: #d4a574;
    }

    nav ul {
      display: flex;
      list-style: none;
      gap: 2rem;
    }

    nav a {
      color: #fff;
      text-decoration: none;
      transition: color 0.3s;
    }

    nav a:hover {
      color: #d4a574;
    }

    /* Hero Section */
    .hero {
      background: linear-gradient(rgba(44, 24, 16, 0.7), rgba(44, 24, 16, 0.7)),
                  url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600"><rect fill="%234a3428" width="1200" height="600"/></svg>');
      background-size: cover;
      background-position: center;
      color: #fff;
      text-align: center;
      padding: 8rem 0;
    }

    .hero h1 {
      font-size: 3.5rem;
      margin-bottom: 1rem;
      color: #d4a574;
    }

    .hero p {
      font-size: 1.3rem;
      margin-bottom: 2rem;
      color: #f5f5f5;
    }

    .cta-button {
      display: inline-block;
      background: #d4a574;
      color: #2c1810;
      padding: 1rem 2.5rem;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      transition: background 0.3s, transform 0.2s;
    }

    .cta-button:hover {
      background: #c49563;
      transform: translateY(-2px);
    }

    /* Section Styles */
    section {
      padding: 4rem 0;
    }

    section h2 {
      text-align: center;
      font-size: 2.5rem;
      margin-bottom: 3rem;
      color: #2c1810;
    }

    /* Featured Menu */
    .menu-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 2rem;
    }

    .menu-item {
      background: #fff;
      border-radius: 10px;
      padding: 2rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: transform 0.3s, box-shadow 0.3s;
    }

    .menu-item:hover {
      transform: translateY(-5px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.15);
    }

    .menu-item h3 {
      color: #2c1810;
      margin-bottom: 0.5rem;
      font-size: 1.5rem;
    }

    .menu-item p {
      color: #666;
      margin-bottom: 1rem;
    }

    .price {
      color: #d4a574;
      font-weight: bold;
      font-size: 1.2rem;
    }

    /* About Section */
    .about {
      background: #f9f5f0;
    }

    .about-content {
      max-width: 800px;
      margin: 0 auto;
      text-align: center;
      font-size: 1.1rem;
      line-height: 1.8;
      color: #555;
    }

    /* Location Section */
    .location-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 3rem;
      max-width: 900px;
      margin: 0 auto;
    }

    .location-card {
      text-align: center;
    }

    .location-card h3 {
      color: #2c1810;
      margin-bottom: 1rem;
      font-size: 1.5rem;
    }

    .location-card p {
      color: #666;
      margin-bottom: 0.5rem;
    }

    /* Footer */
    footer {
      background: #2c1810;
      color: #fff;
      padding: 2rem 0;
      text-align: center;
    }

    .social-links {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 1rem;
    }

    .social-links a {
      color: #d4a574;
      text-decoration: none;
      font-size: 1.2rem;
      transition: color 0.3s;
    }

    .social-links a:hover {
      color: #fff;
    }

    footer p {
      color: #999;
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      .hero h1 {
        font-size: 2.5rem;
      }

      nav ul {
        gap: 1rem;
      }

      section h2 {
        font-size: 2rem;
      }
    }
  </style>
</head>
<body>
  <!-- Navigation -->
  <nav role="navigation" aria-label="Main navigation">
    <div class="container">
      <div class="logo" role="banner">☕ Brew Haven</div>
      <ul>
        <li><a href="#home">Home</a></li>
        <li><a href="#menu">Menu</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </div>
  </nav>

  <!-- Hero Section -->
  <header id="home" class="hero">
    <div class="container">
      <h1>Welcome to Brew Haven</h1>
      <p>Where every cup tells a story</p>
      <a href="#menu" class="cta-button" aria-label="Explore our menu">Explore Our Menu</a>
    </div>
  </header>

  <!-- Featured Menu Section -->
  <section id="menu" aria-labelledby="menu-heading">
    <div class="container">
      <h2 id="menu-heading">Featured Menu</h2>
      <div class="menu-grid">
        <article class="menu-item">
          <h3>Espresso</h3>
          <p>Rich and bold, our signature espresso is crafted from premium Arabica beans, delivering a smooth finish with notes of dark chocolate.</p>
          <span class="price" aria-label="Price: $3.50">$3.50</span>
        </article>
        <article class="menu-item">
          <h3>Cappuccino</h3>
          <p>Perfectly balanced espresso topped with velvety steamed milk and a light foam crown. A classic Italian favorite.</p>
          <span class="price" aria-label="Price: $4.50">$4.50</span>
        </article>
        <article class="menu-item">
          <h3>Caramel Macchiato</h3>
          <p>Espresso meets vanilla-flavored milk, marked with caramel drizzle. Sweet, creamy, and utterly indulgent.</p>
          <span class="price" aria-label="Price: $5.25">$5.25</span>
        </article>
        <article class="menu-item">
          <h3>Cold Brew</h3>
          <p>Smooth and refreshing, our cold brew is steeped for 16 hours to bring out naturally sweet and mellow flavors.</p>
          <span class="price" aria-label="Price: $4.75">$4.75</span>
        </article>
        <article class="menu-item">
          <h3>Mocha Latte</h3>
          <p>A delightful blend of espresso, steamed milk, and rich chocolate, topped with whipped cream for the perfect treat.</p>
          <span class="price" aria-label="Price: $5.00">$5.00</span>
        </article>
        <article class="menu-item">
          <h3>Matcha Latte</h3>
          <p>Premium Japanese matcha whisked with steamed milk. Earthy, smooth, and energizing with a touch of sweetness.</p>
          <span class="price" aria-label="Price: $5.50">$5.50</span>
        </article>
      </div>
    </div>
  </section>

  <!-- About Us Section -->
  <section id="about" class="about" aria-labelledby="about-heading">
    <div class="container">
      <h2 id="about-heading">About Us</h2>
      <div class="about-content">
        <p>
          Founded in 2015, Brew Haven began as a small neighborhood coffee shop with a big dream: 
          to create a warm, welcoming space where people could enjoy exceptional coffee and meaningful connections.
        </p>
        <p style="margin-top: 1.5rem;">
          We source our beans directly from sustainable farms around the world, ensuring every cup 
          supports both quality and ethical practices. Our expert baristas are passionate about their craft, 
          bringing years of experience to every pour, steam, and brew.
        </p>
        <p style="margin-top: 1.5rem;">
          Whether you're here for a quick espresso or to settle in with a book, Brew Haven is your home away from home.
        </p>
      </div>
    </div>
  </section>

  <!-- Location & Hours Section -->
  <section id="contact" aria-labelledby="contact-heading">
    <div class="container">
      <h2 id="contact-heading">Visit Us</h2>
      <div class="location-grid">
        <article class="location-card">
          <h3>📍 Location</h3>
          <address>
            <p>123 Coffee Street</p>
            <p>Downtown District</p>
            <p>Seattle, WA 98101</p>
          </address>
        </article>
        <article class="location-card">
          <h3>🕐 Hours</h3>
          <p>Monday - Friday: 7:00 AM - 8:00 PM</p>
          <p>Saturday: 8:00 AM - 9:00 PM</p>
          <p>Sunday: 8:00 AM - 7:00 PM</p>
        </article>
        <article class="location-card">
          <h3>📞 Contact</h3>
          <p>Phone: <a href="tel:+12065552739" style="color: #2c1810; text-decoration: none;">(206) 555-BREW</a></p>
          <p>Email: <a href="mailto:hello@brewhaven.com" style="color: #2c1810; text-decoration: none;">hello@brewhaven.com</a></p>
          <p>Instagram: <a href="https://instagram.com/brewhaven" style="color: #2c1810; text-decoration: none;" target="_blank" rel="noopener noreferrer">@brewhaven</a></p>
        </article>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer role="contentinfo">
    <div class="container">
      <nav class="social-links" aria-label="Social media links">
        <a href="https://facebook.com/brewhaven" target="_blank" rel="noopener noreferrer" aria-label="Visit our Facebook page">Facebook</a>
        <a href="https://instagram.com/brewhaven" target="_blank" rel="noopener noreferrer" aria-label="Visit our Instagram page">Instagram</a>
        <a href="https://twitter.com/brewhaven" target="_blank" rel="noopener noreferrer" aria-label="Visit our Twitter page">Twitter</a>
      </nav>
      <p>&copy; 2024 Brew Haven. All rights reserved.</p>
    </div>
  </footer>
</body>
</html>`
    );
  });

  return app;
}
