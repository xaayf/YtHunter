module.exports = {
  safelist: [
    ...['emerald','amber','rose'].flatMap((c) => [`bg-${c}-500/10`, `bg-${c}-500/20`, `text-${c}-300`, `border-${c}-500/30`])
  ],
  content: ['./src/index.html', './src/app.js', './src/lib.js'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#f5f3ff',300:'#c4b5fd',400:'#a78bfa',500:'#8b5cf6',600:'#7c3aed',700:'#6d28d9',950:'#2e1065' },
        surface: { darkest:'#0b0d14', dark:'#11141f', card:'#171a28', border:'#23273c', highlight:'#2a304a' }
      },
      fontFamily: { sans: ['-apple-system','BlinkMacSystemFont','"SF Pro Text"','"Segoe UI"','Roboto','sans-serif'] }
    }
  },
  plugins: []
};
