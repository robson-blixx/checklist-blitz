# Checklist Blitz

Controle de checklists para as operações **Jet** e **Total**. O mesmo motorista pode ter um cadastro independente em cada operação.

- Jet: vencimento 20 dias após a data de emissão.
- Total: vencimento 15 dias após a data de emissão.
- Cinco dias antes do vencimento: status **Solicitado**.
- No dia do vencimento: **Vence hoje**; no dia seguinte: **Vencido**; depois: **Atrasado**.
- Tipologias: 3/4, Toco, Truck, Cavalo/Carreta, Fiorino, Van e VUC.

Abra `index.html` no navegador ou execute `python server.py` para testar localmente.

Os registros e telefones ficam no armazenamento local do navegador. A versão publicada no GitHub Pages distribui as atualizações do **código** quando a página é recarregada, mas os cadastros de navegadores diferentes não são compartilhados. O arquivo `server.py` é apenas um servidor local; o GitHub Pages não executa Python. O envio automático por WhatsApp e o compartilhamento de cadastros exigirão uma próxima etapa com um serviço Python hospedado e armazenamento persistente. Nenhuma mensagem é enviada nesta versão.
