import app from './app.js'

const PORT = parseInt(process.env.PORT || '3001')

app.listen(PORT, () => {
  console.log(`Dev server running on http://localhost:${PORT}`)
})
