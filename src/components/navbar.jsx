function Navbar() {
  return (
    <nav style={{ background: "#222", padding: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h2 style={{ color: "white", margin: 0 }}>🛒 MyShop</h2>
      <div style={{ display: "flex", gap: "1.5rem" }}>
        <a href="#" style={{ color: "white", textDecoration: "none" }}>Home</a>
        <a href="#" style={{ color: "white", textDecoration: "none" }}>Products</a>
        <a href="#" style={{ color: "white", textDecoration: "none" }}>Cart 🛒</a>
      </div>
    </nav>
  )
}

export default Navbar