const products = [
  { id: 1, name: "Sneakers", price: "$49.99", emoji: "👟" },
  { id: 2, name: "Watch", price: "$99.99", emoji: "⌚" },
  { id: 3, name: "Bag", price: "$79.99", emoji: "👜" },
  { id: 4, name: "Sunglasses", price: "$29.99", emoji: "🕶️" },
]

function Products() {
  return (
    <div style={{ padding: "2rem" }}>
      <h2 style={{ textAlign: "center" }}>Our Products</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.5rem", marginTop: "1.5rem" }}>
        {products.map(product => (
          <div key={product.id} style={{ background: "#f9f9f9", borderRadius: "10px", padding: "1.5rem", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <div style={{ fontSize: "3rem" }}>{product.emoji}</div>
            <h3>{product.name}</h3>
            <p style={{ color: "#888" }}>{product.price}</p>
            <button style={{ marginTop: "0.5rem", padding: "0.5rem 1.5rem", background: "#222", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
              Add to Cart
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Products