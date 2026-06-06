import { useEffect, useState } from 'react'
import { Category, fetchCategories } from '../api/client'

interface Props {
  onBack: () => void
}

export default function CategoriesList({ onBack }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(err => {
        console.error(err)
        setError(err.message)
      })
  }, [])

  if (error) {
    return <div style={{ color: 'red', padding: '20px' }}>Error: {error}</div>
  }

  if (!categories.length) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none',
        border: 'none',
        color: '#0066cc',
        cursor: 'pointer',
        fontSize: '14px',
        marginBottom: '16px',
        padding: 0,
      }}>
        ← Back to Dashboard
      </button>
      <h2 style={{ marginBottom: '12px' }}>Categories</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
        <thead>
          <tr style={{ background: '#eee', textAlign: 'left' }}>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Type</th>
          </tr>
        </thead>
        <tbody>
          {categories.map(c => (
            <tr key={c.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={tdStyle}>{c.name}</td>
              <td style={tdStyle}>{c.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '2px solid #ccc',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
}
