import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-white mb-4">🧂 Sal Vita</h1>
        <p className="text-blue-100 mb-8">Sistema de Gestão de Vendas e Performance</p>
        
        <div className="space-y-4">
          <Link
            href="/login"
            className="block w-full bg-white text-blue-900 py-3 rounded-lg font-semibold hover:bg-blue-50 transition"
          >
            Fazer Login
          </Link>
          
          <Link
            href="/signup"
            className="block w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-500 transition"
          >
            Criar Conta
          </Link>
        </div>

        <p className="text-blue-200 text-sm mt-8">
          Credenciais de teste:<br/>
          Email: comercial@salvitarn.com.br<br/>
          Senha: SalVita2024!
        </p>
      </div>
    </main>
  )
}
