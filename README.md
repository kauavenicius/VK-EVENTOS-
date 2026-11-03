# Halloween da VK — site e painel administrativo

Projeto inicial completo para publicar o site da Halloween da VK.

## Arquivos
- `index.html`: página pública e painel administrativo.
- `styles.css`: identidade visual responsiva preto/vermelho.
- `app.js`: cadastro, WhatsApp, vagas, painel, preços, promoções, pagamentos e CSV.
- `config.js`: configurações do Supabase, WhatsApp e Pix.
- `supabase.sql`: tabelas, políticas de segurança, função de reserva e registros iniciais.

## Dados já configurados
- Evento: 14/11/2026, das 21h às 04h.
- Endereço: Rua Hellmuth Butzke, nº 76, Bairro Velha Central, Blumenau - SC, CEP 89046-490.
- Idade mínima: 16 anos completos.
- Capacidade: 60 pessoas.
- Valores padrão: R$ 25 feminino e R$ 30 masculino.
- WhatsApp: +55 47 99231-6046.
- Pix Copia e Cola: fornecido pelo organizador.

## Para ativar o cadastro e painel
1. Crie um projeto em https://supabase.com.
2. Abra SQL Editor no Supabase e execute o conteúdo de `supabase.sql`.
3. Em Project Settings > API, copie Project URL e anon/public key.
4. Cole esses dois valores em `config.js`. Não coloque a chave `service_role` no navegador.
5. Em Authentication > Users, crie o usuário administrador com e-mail e senha.
6. Copie o UUID desse usuário e execute no SQL Editor:
   `insert into public.admins(user_id) values('UUID-DO-USUARIO');`
7. Hospede os arquivos juntos em um serviço de hospedagem estática (por exemplo, Netlify, Vercel ou GitHub Pages).
8. Abra `seudominio/#admin` para entrar no painel.

## Como funciona
- O formulário chama uma função SQL atômica para verificar e ocupar uma vaga, sem permitir duas reservas simultâneas da última vaga.
- A solicitação começa como `pending`; a equipe confere o Pix e as fotos no WhatsApp e então marca como confirmada no painel.
- O contador público considera solicitações pendentes e confirmadas. Cancelar uma inscrição libera a vaga.
- O painel permite confirmar Pix, cancelar inscrições, exportar CSV, editar preços e criar/editar/ativar/desativar promoções.
- As alterações de promoções ficam registradas no histórico.
- O comprador precisa anexar manualmente a foto do documento e o comprovante Pix no WhatsApp. O site não faz upload desses documentos.
- O Pix informado foi incluído em `config.js`, mas é necessário testar no aplicativo bancário antes de divulgar. O código Pix recebido não contém valor explícito; confirme o valor da cobrança com o banco.
- A lista inicial inclui os três nomes enviados pelo organizador como confirmados. Telefone, idade e gênero não foram fornecidos e ficam sem informação. O valor da Amanda também não foi informado e aparece como “A confirmar”; atualize-o quando souber o valor pago. Os outros dois valores foram lançados como R$ 20 conforme a promoção informada.

## Segurança e privacidade
- Nunca exponha a `service_role key`.
- Use senha forte e limite a lista de administradores.
- Não armazene foto de documento ou comprovante neste site; o comprador os envia diretamente pelo WhatsApp oficial.
- O cadastro coleta nome, telefone e idade. Restrinja o acesso administrativo e apague dados quando não forem mais necessários.
- A política de cancelamento exibida informa a regra após 10/11/2026, mas ressalva os direitos legais do consumidor. Confirme a política com orientação adequada antes de publicar.

## Importante antes de abrir as vendas
O projeto precisa ser conectado ao Supabase e testado com uma inscrição de teste, confirmação/cancelamento, promoção e exportação CSV. O Pix deve ser validado com uma transferência de baixo valor ou pela tela de confirmação do banco. O site não detecta automaticamente pagamentos Pix; a conferência é manual.
