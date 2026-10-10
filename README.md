# Checklist Blitz

Painel público em GitHub Pages com registros Jet e Total independentes. O mesmo motorista pode aparecer nas duas operações. Jet vence 20 dias após a emissão; Total vence 15 dias após a emissão. O responsável escolhe de 0 a 20 dias antes do vencimento para o aviso; o padrão é 5 dias. Nesse período, o status é **Aviso pendente** até o serviço confirmar os envios para motorista e responsável; depois fica **Solicitado**. As tipologias disponíveis são 3/4, Toco, Truck, Cavalo/Carreta, Fiorino, Van e VUC.

## Estado atual

O painel pode ser usado no navegador em modo local. Para cadastros compartilhados e avisos automáticos, é necessário hospedar `backend.py` em um serviço Python que permaneça ligado e tenha disco persistente. A página permite informar o endereço HTTPS desse serviço e uma chave privada. Ao conectar, o usuário pode enviar os cadastros locais para o serviço.

O número remetente **não fica no repositório**. Ele deve ser registrado na WhatsApp Business Platform da Meta. O código usa o `phone number ID` dessa conta e um token de acesso, ambos definidos como variáveis privadas no serviço hospedado. Também é necessário um modelo de mensagem aprovado com três parâmetros de texto, nesta ordem: nome do motorista, operação e data de vencimento. O telefone do responsável fica como variável privada do serviço.

## Configuração do serviço Python

Defina estas variáveis no provedor de hospedagem, sem incluí-las em arquivos públicos:

```text
CHECKLIST_ADMIN_TOKEN=<chave aleatória longa para entrar no painel>
CHECKLIST_DB_PATH=<caminho de um disco persistente>/checklist.db
CHECKLIST_SITE_ORIGIN=https://robson-blixx.github.io
CHECKLIST_ADMIN_PHONE=<telefone do responsável com código do país>
WHATSAPP_PHONE_NUMBER_ID=<ID do número registrado na Meta>
WHATSAPP_ACCESS_TOKEN=<token da Meta>
WHATSAPP_TEMPLATE_NAME=<nome do modelo aprovado>
WHATSAPP_TEMPLATE_LANG=pt_BR
PORT=<porta exigida pelo provedor>
```

Inicie com `python backend.py`. O serviço oferece `/health`, `/records` e `/settings`. A verificação roda diariamente a partir das 09h no fuso de São Paulo. Cada destinatário recebe no máximo um aviso por cadastro e vencimento: um para o motorista e um para o responsável. Quando o checklist é renovado com nova data de emissão, o novo vencimento inicia outro ciclo. O serviço precisa ficar ligado; se estiver desligado, não envia. Teste primeiro com destinatários autorizados antes de usar em produção.

O GitHub Pages não executa Python. A publicação do painel no GitHub não hospeda `backend.py` nem ativa envios por si só. Nunca coloque token da Meta, chave de acesso, número privado ou banco de dados no repositório público.
