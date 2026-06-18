/**
 * Modelos (templates) dos documentos comerciais CLINIONEX360 — Proposta e
 * Contrato. Os corpos abaixo reproduzem os modelos fornecidos pela operação,
 * com duas diferenças intencionais:
 *
 *   1. As linhas de título/front-matter do topo (ex.: "# PROPOSTA COMERCIAL",
 *      "## CLINIONEX360") foram removidas porque o cabeçalho do PDF já desenha
 *      a marca CLINIONEX360, a tagline e o título do documento.
 *   2. As condições comerciais e os blocos de assinatura são renderizados de
 *      forma estruturada pelo renderizador a partir dos marcadores
 *      `[[CONDICOES_COMERCIAIS]]` e `[[ASSINATURAS]]` — assim a tabela de
 *      condições tem uma única fonte de verdade (o snapshot da clínica) e não
 *      depende de substituição de placeholders linha a linha.
 *
 * Sintaxe markdown-ish suportada pelo renderizador (`commercial-pdf.ts`):
 *   `# h1`  `## h2`  `### h3`  `---` (régua)  `* item` (lista)  `**negrito**`
 *   `[[CONDICOES_COMERCIAIS]]`  `[[ASSINATURAS]]`
 * Cada linha não vazia é um parágrafo próprio (não há junção de linhas), o que
 * preserva listas numeradas (I., II., ...) e pares "rótulo: valor".
 *
 * NUNCA usar a palavra "governança" — a identidade é CLINIONEX360 / IONEX360.
 */

export interface CommercialTemplate {
  tipo: "proposta" | "contrato";
  titulo: string;
  corpo: string;
}

const PROPOSTA_CORPO = `**Proposta para:** {{nome_cliente}}
**CNPJ:** {{cnpj_cliente}}
**Cidade/UF:** {{cidade_uf}}
**Data de emissão:** {{data_emissao}}
**Validade da proposta:** {{validade_proposta}} dias
**Responsável comercial:** {{responsavel_comercial}}

---

# 1. Visão Geral

A CLINIONEX360 é uma solução de Inteligência Empresarial desenvolvida pela IONEX360 para clínicas que precisam transformar dados, documentos, rotinas, riscos e decisões em uma gestão mais clara, organizada e acompanhável.

O objetivo não é entregar apenas um sistema ou um painel visual. A proposta é estruturar uma rotina de gestão baseada em informação confiável, leitura técnica, acompanhamento consultivo e execução organizada.

Por meio de uma assessoria consultiva multidisciplinar, a IONEX360 apoia a clínica na identificação de pontos críticos, organização das informações, construção de indicadores, mapeamento de riscos, elaboração de plano de ação e implantação de um painel de gestão personalizado conforme a realidade do cliente.

Ao final da implantação, a clínica passa a contar com uma visão mais clara sobre o que está acontecendo, o que precisa de atenção, quem é responsável por cada ação e quais informações devem orientar as decisões dos sócios, diretoria e equipe administrativa.

---

# 2. O Desafio

Clínicas em crescimento normalmente acumulam sistemas, planilhas, documentos, controles paralelos e informações espalhadas entre áreas diferentes.

O financeiro enxerga uma parte. A recepção enxerga outra. O estoque possui seus próprios controles. Os documentos ficam dispersos. As redes sociais geram dados que nem sempre conversam com o comercial. A manutenção possui prazos e riscos próprios. A diretoria, muitas vezes, precisa decidir sem ter uma visão consolidada da operação.

Esse cenário gera problemas como:

* dificuldade para entender a real performance da clínica;
* excesso de dependência de pessoas específicas;
* baixa previsibilidade financeira e operacional;
* riscos não mapeados;
* documentos sem controle centralizado;
* decisões tomadas com base em percepções, e não em dados;
* tarefas sem responsável, prazo ou evidência;
* dificuldade para acompanhar a execução do que foi decidido.

A CLINIONEX360 nasce para resolver esse problema: transformar informações dispersas em inteligência empresarial aplicada à rotina da clínica.

---

# 3. A Solução Proposta

A IONEX360 atuará em três frentes integradas.

## 3.1 Assessoria Consultiva Empresarial

Uma equipe multidisciplinar acompanha a clínica com olhar técnico, estratégico e operacional.

A atuação envolve análise de informações, identificação de riscos, leitura de indicadores, apoio à tomada de decisão e acompanhamento das ações definidas.

## 3.2 Diagnóstico 360

Será realizado um diagnóstico estruturado para compreender a situação atual da clínica, considerando áreas como:

* estratégia e posicionamento;
* financeiro e rentabilidade;
* contabilidade e obrigações;
* processos internos;
* pessoas e responsabilidades;
* tecnologia e dados;
* comercial e marketing;
* documentos, contratos e riscos relevantes.

O diagnóstico permite identificar maturidade, lacunas, gargalos, riscos e oportunidades de melhoria.

## 3.3 Painel de Inteligência Empresarial

Após o diagnóstico e o entendimento das necessidades da clínica, será desenhado um painel personalizado de gestão.

Esse painel poderá consolidar informações de diferentes fontes, como sistemas financeiros, agenda, estoque, manutenção, documentos, tarefas, redes sociais, planilhas e outros sistemas utilizados pela clínica.

O objetivo do painel é responder às perguntas que realmente importam para a gestão:

* O que está acontecendo?
* Onde estão os riscos?
* Quais indicadores precisam de atenção?
* Quais tarefas estão atrasadas?
* Quem é responsável por cada ação?
* Quais documentos vencem nos próximos dias?
* Quais áreas precisam de decisão?
* O que deve ser acompanhado pela diretoria?

---

# 4. Jornada de Implantação

A implantação seguirá uma jornada estruturada, com etapas encadeadas.

## Etapa 1 — Cadastro da Clínica

Coleta e validação dos dados cadastrais, societários, operacionais e comerciais da clínica, aproveitando as informações já existentes no sistema.

## Etapa 2 — Proposta e Aceite

A proposta comercial é apresentada ao cliente com escopo, investimento, prazo, etapas e condições comerciais. Após aceite, será gerado o contrato de prestação de serviços.

## Etapa 3 — Contrato e Assinatura Eletrônica

Após o aceite da proposta, o contrato será gerado com os dados atualizados e enviado para assinatura eletrônica via Autentique.

## Etapa 4 — Reunião de Alinhamento / Kick-off

Após a assinatura, será realizada a reunião inicial para alinhamento da metodologia, responsáveis, cronograma, canais de comunicação, documentos necessários e próximos passos.

## Etapa 5 — Captação de Documentos e Informações

A clínica disponibilizará os documentos, acessos e informações necessários para a análise inicial.

Poderão ser solicitados documentos societários, contratos, relatórios financeiros, informações contábeis, dados operacionais, lista de sistemas, controles internos, documentos regulatórios e demais informações relevantes.

## Etapa 6 — Diagnóstico 360

A equipe IONEX360 realizará a leitura estruturada das informações coletadas, entrevistas, análise documental e avaliação dos principais pilares da gestão.

## Etapa 7 — Mapeamento de Riscos

Os riscos identificados serão classificados por área, impacto, probabilidade, prioridade, responsável e prazo de tratamento.

## Etapa 8 — Plano de Ação

As oportunidades, riscos e prioridades serão convertidas em plano de ação, com tarefas, responsáveis, prazos, status e evidências.

## Etapa 9 — Desenho do Painel

Com base nas necessidades reais da clínica, será definido o desenho do Painel de Inteligência Empresarial, incluindo indicadores, módulos, fontes de dados e visualizações prioritárias.

## Etapa 10 — Validação, Criação e Treinamento

A estrutura do painel será validada com a clínica. Após aprovação, será realizada a criação, parametrização, treinamento dos usuários e orientação sobre a rotina de uso.

## Etapa 11 — Acompanhamento Consultivo

Após a implantação, a IONEX360 acompanhará a evolução dos indicadores, tarefas, riscos e decisões, apoiando a clínica na leitura das informações e na organização da execução.

---

# 5. Entregas Incluídas

A presente proposta contempla:

* cadastro e estruturação inicial da clínica na plataforma;
* reunião de kick-off;
* levantamento de documentos, sistemas, fontes de dados e responsáveis;
* diagnóstico empresarial 360;
* mapeamento de riscos;
* estruturação de plano de ação;
* desenho do painel de inteligência empresarial;
* criação e parametrização dos módulos prioritários;
* treinamento inicial dos usuários;
* acompanhamento consultivo recorrente;
* reuniões periódicas de leitura e acompanhamento;
* apoio técnico na interpretação de dados, riscos e prioridades;
* organização de informações relevantes para a tomada de decisão.

## Módulos possíveis do Painel de Inteligência Empresarial

O painel será personalizado conforme a realidade da clínica e poderá contemplar, conforme viabilidade técnica e prioridade definida no diagnóstico:

* visão executiva;
* indicadores financeiros;
* receitas, despesas, margem e resultado;
* agenda e produtividade;
* estoque e insumos;
* manutenção e equipamentos;
* documentos e vencimentos;
* contratos e obrigações;
* tarefas e plano de ação;
* mapa de riscos;
* redes sociais e indicadores comerciais;
* relatórios executivos;
* acompanhamento de responsáveis e prazos.

As integrações com sistemas externos dependerão da disponibilidade técnica, acesso, API, exportação de dados ou possibilidade de importação estruturada. Quando a integração automática não for possível no primeiro momento, poderá ser adotada alimentação manual assistida ou importação periódica de dados.

---

# 6. Investimento e Condições Comerciais

## Plano CLINIONEX360

### Inteligência Empresarial através de Assessoria Consultiva

[[CONDICOES_COMERCIAIS]]

[[CONDICOES_ESPECIAIS]]

O investimento contempla a implantação, diagnóstico, estruturação inicial, desenho do painel, parametrização dos módulos prioritários, treinamento e acompanhamento consultivo conforme escopo definido nesta proposta.

Demandas adicionais, novos módulos, integrações complexas, desenvolvimento específico, ampliação relevante de escopo ou execução operacional direta de atividades internas da clínica poderão ser objeto de proposta complementar.

## O que não está incluído

Não estão incluídos nesta proposta, salvo contratação específica:

* execução operacional diária do financeiro da clínica;
* contas a pagar, contas a receber ou conciliação bancária como BPO;
* atuação como departamento jurídico interno;
* execução de campanhas de marketing;
* substituição da equipe administrativa da clínica;
* integrações não viáveis tecnicamente ou não previstas no escopo inicial;
* desenvolvimento ilimitado de funcionalidades;
* suporte ilimitado fora dos canais e horários definidos;
* tomada de decisão em nome dos sócios ou administradores.

A IONEX360 atua como assessoria consultiva, organizando informações, apontando riscos, estruturando indicadores e apoiando a gestão. As decisões e execuções internas permanecem sob responsabilidade da clínica.

---

# 7. Resultados Esperados e Próximos Passos

Com a implantação da CLINIONEX360, espera-se que a clínica tenha:

* maior clareza sobre sua situação financeira, operacional e administrativa;
* dados mais organizados e úteis para decisão;
* riscos identificados e priorizados;
* plano de ação com responsáveis e prazos;
* redução de controles paralelos;
* documentos e vencimentos mais acompanháveis;
* indicadores definidos conforme a realidade da gestão;
* reuniões mais objetivas;
* sócios e diretoria com melhor visão da operação;
* acompanhamento consultivo para transformar informação em ação.

Os resultados dependem da participação ativa da clínica, do fornecimento de informações, da validação das decisões e da execução do plano de ação aprovado.

## Próximos passos

1. Aceite desta proposta;
2. Geração automática do contrato;
3. Envio da proposta e do contrato para assinatura via Autentique;
4. Assinatura eletrônica pelas partes;
5. Agendamento do kick-off;
6. Início da coleta de documentos e informações;
7. Execução do Diagnóstico 360;
8. Construção do mapa de riscos e plano de ação;
9. Desenho e implantação do Painel de Inteligência Empresarial;
10. Treinamento e acompanhamento consultivo.

## Aceite da Proposta

Ao aceitar esta proposta, a CONTRATANTE declara estar ciente do escopo, condições comerciais, etapas de implantação e premissas aqui apresentadas, autorizando a geração do contrato de prestação de serviços correspondente.

[[ASSINATURAS]]`;

const CONTRATO_CORPO = `# CLÁUSULA 1 — DAS PARTES

**CONTRATANTE:** {{razao_social_cliente}}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº {{cnpj_cliente}}, com sede em {{endereco_completo_cliente}}, neste ato representada por {{representante_cliente}}, CPF nº {{cpf_representante_cliente}}, doravante denominada simplesmente **CONTRATANTE**.

**CONTRATADA:** {{razao_social_ionex360}}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº {{cnpj_ionex360}}, com sede em {{endereco_ionex360}}, neste ato representada por {{representante_ionex360}}, CPF nº {{cpf_representante_ionex360}}, doravante denominada simplesmente **CONTRATADA**.

As partes resolvem celebrar o presente Contrato de Prestação de Serviços de Inteligência Empresarial através de Assessoria Consultiva, mediante as cláusulas e condições seguintes.

---

# CLÁUSULA 2 — DO OBJETO

O presente contrato tem por objeto a prestação, pela CONTRATADA, de serviços de Inteligência Empresarial através de Assessoria Consultiva para Clínicas, por meio da solução **CLINIONEX360**, abrangendo diagnóstico empresarial, mapeamento de riscos, plano de ação, estruturação de indicadores, organização de informações gerenciais, implantação de painel de inteligência empresarial e acompanhamento consultivo recorrente.

Parágrafo único. A atuação da CONTRATADA tem natureza consultiva, estratégica, técnica e organizacional, não implicando substituição da administração da CONTRATANTE, execução operacional diária de suas áreas internas ou tomada de decisão em nome dos sócios, administradores ou gestores da clínica.

---

# CLÁUSULA 3 — DO ESCOPO DOS SERVIÇOS

Os serviços contemplam:

I. cadastro e estruturação inicial da clínica na plataforma;
II. reunião de alinhamento e kick-off;
III. levantamento de documentos, sistemas, fontes de dados, processos e responsáveis;
IV. realização de Diagnóstico 360;
V. mapeamento de riscos financeiros, operacionais, jurídicos, documentais, comerciais, tecnológicos e administrativos;
VI. estruturação de plano de ação com responsáveis, prazos, prioridades e status;
VII. desenho e parametrização do Painel de Inteligência Empresarial;
VIII. treinamento inicial dos usuários;
IX. acompanhamento consultivo recorrente;
X. reuniões periódicas de leitura, acompanhamento e priorização.

---

# CLÁUSULA 4 — DA JORNADA DE IMPLANTAÇÃO

A implantação observará as seguintes etapas:

I. Cadastro da clínica;
II. Aceite da proposta;
III. Assinatura do contrato;
IV. Kick-off;
V. Captação de documentos e informações;
VI. Diagnóstico 360;
VII. Mapeamento de riscos;
VIII. Plano de ação;
IX. Desenho do painel;
X. Validação;
XI. Treinamento;
XII. Acompanhamento consultivo.

Parágrafo único. O cronograma poderá ser ajustado conforme disponibilidade de informações, participação da equipe da CONTRATANTE, complexidade das integrações e prioridades definidas em conjunto.

---

# CLÁUSULA 5 — DO PAINEL DE INTELIGÊNCIA EMPRESARIAL

O Painel de Inteligência Empresarial será personalizado conforme a realidade da CONTRATANTE e poderá contemplar, de acordo com viabilidade técnica e prioridades definidas no diagnóstico:

I. visão executiva;
II. indicadores financeiros;
III. agenda e produtividade;
IV. estoque;
V. manutenção;
VI. documentos e vencimentos;
VII. contratos;
VIII. tarefas e plano de ação;
IX. mapa de riscos;
X. redes sociais e indicadores comerciais;
XI. relatórios executivos.

Parágrafo primeiro. A integração com sistemas externos dependerá da disponibilidade técnica, existência de API, possibilidade de exportação de dados, autorização de acesso ou importação estruturada.

Parágrafo segundo. Quando a integração automática não for tecnicamente viável no primeiro momento, poderá ser adotada alimentação manual assistida ou importação periódica de dados.

---

# CLÁUSULA 6 — DA ASSESSORIA CONSULTIVA

A CONTRATADA prestará assessoria consultiva para apoiar a leitura de dados, identificação de riscos, organização de prioridades, acompanhamento do plano de ação e estruturação de informações úteis à tomada de decisão.

Parágrafo único. A assessoria não caracteriza administração direta da clínica, gestão operacional, BPO financeiro, departamento jurídico interno, contabilidade, agência de marketing ou execução direta de tarefas internas da CONTRATANTE.

---

# CLÁUSULA 7 — DO PRAZO

O presente contrato terá vigência de {{prazo_contrato_meses}} meses, contados da data de assinatura.

Parágrafo primeiro. A fase inicial de implantação terá prazo estimado conforme definido na proposta comercial, podendo variar de acordo com a complexidade do projeto, disponibilidade de dados e colaboração da CONTRATANTE.

Parágrafo segundo. A recorrência terá início em {{data_inicio_recorrencia}}.

---

# CLÁUSULA 8 — DO INVESTIMENTO E FORMA DE PAGAMENTO

Pelos serviços contratados, a CONTRATANTE pagará à CONTRATADA:

I. Valor de implantação: R$ {{valor_implantacao}};
II. Valor mensal recorrente: R$ {{valor_mensal}};
III. Vencimento mensal: dia {{dia_vencimento}} de cada mês;
IV. Forma de pagamento: {{forma_pagamento}};
V. Índice de reajuste: {{indice_reajuste}}.

[[CONDICOES_ESPECIAIS]]

Parágrafo primeiro. Os valores mensais serão devidos durante toda a vigência contratual.

Parágrafo segundo. O atraso no pagamento sujeitará a CONTRATANTE ao pagamento de multa de 2% sobre o valor em atraso, juros de mora de 1% ao mês, calculados pro rata die, e correção monetária pelo índice contratual indicado.

Parágrafo terceiro. Os valores poderão ser revistos em caso de ampliação relevante de escopo, inclusão de novos módulos, integrações adicionais, aumento significativo de volume de dados ou contratação de serviços complementares.

---

# CLÁUSULA 9 — DAS OBRIGAÇÕES DA CONTRATADA

São obrigações da CONTRATADA:

I. conduzir a metodologia CLINIONEX360;
II. realizar o diagnóstico e análise das informações disponibilizadas;
III. estruturar mapa de riscos e plano de ação;
IV. desenhar e parametrizar o painel conforme escopo contratado;
V. orientar a CONTRATANTE quanto à utilização da plataforma;
VI. realizar reuniões periódicas de acompanhamento;
VII. manter sigilo sobre as informações acessadas;
VIII. observar a legislação aplicável de proteção de dados;
IX. prestar suporte nos canais e condições definidos;
X. comunicar limitações técnicas ou necessidades adicionais identificadas durante a execução.

---

# CLÁUSULA 10 — DAS OBRIGAÇÕES DA CONTRATANTE

São obrigações da CONTRATANTE:

I. disponibilizar informações, documentos e dados necessários;
II. indicar responsáveis internos para interação com a CONTRATADA;
III. garantir acesso aos sistemas, quando necessário e autorizado;
IV. validar informações, indicadores, riscos e plano de ação;
V. executar internamente as ações aprovadas;
VI. participar das reuniões agendadas;
VII. efetuar os pagamentos nos prazos contratados;
VIII. manter sigilo sobre metodologia, plataforma e materiais da CONTRATADA;
IX. comunicar alterações relevantes em sua operação;
X. cumprir as normas legais, regulatórias e administrativas aplicáveis à sua atividade.

---

# CLÁUSULA 11 — DAS EXCLUSÕES DE ESCOPO

Não estão incluídos neste contrato, salvo contratação específica:

I. execução operacional diária das áreas da CONTRATANTE;
II. BPO financeiro;
III. contas a pagar;
IV. contas a receber;
V. conciliação bancária operacional;
VI. atuação como departamento jurídico interno;
VII. atuação como contabilidade da CONTRATANTE;
VIII. execução de campanhas de marketing;
IX. substituição da equipe administrativa da clínica;
X. desenvolvimento ilimitado de funcionalidades;
XI. integrações não previstas ou inviáveis tecnicamente;
XII. suporte ilimitado fora das condições contratadas.

---

# CLÁUSULA 12 — DOS RESULTADOS ESPERADOS

A metodologia tem por finalidade proporcionar maior clareza gerencial, organização de informações, identificação de riscos, acompanhamento de indicadores, plano de ação estruturado e melhor suporte à tomada de decisão.

Parágrafo único. Os resultados dependem da participação ativa da CONTRATANTE, da qualidade das informações fornecidas, da validação das decisões e da execução interna do plano de ação, não constituindo garantia de resultado financeiro, operacional ou comercial específico.

---

# CLÁUSULA 13 — DA CONFIDENCIALIDADE

As partes obrigam-se a manter sigilo sobre todas as informações estratégicas, comerciais, financeiras, técnicas, operacionais, contratuais, cadastrais e documentais a que tiverem acesso em razão deste contrato.

Parágrafo único. A obrigação de confidencialidade permanecerá vigente mesmo após o término contratual, pelo prazo de 2 anos, salvo informações que por lei devam permanecer protegidas por prazo superior.

---

# CLÁUSULA 14 — DA PROTEÇÃO DE DADOS — LGPD

As partes comprometem-se a cumprir a Lei Geral de Proteção de Dados Pessoais — Lei nº 13.709/2018.

Parágrafo primeiro. A CONTRATADA tratará dados pessoais exclusivamente para as finalidades relacionadas à execução deste contrato.

Parágrafo segundo. A CONTRATANTE declara ser responsável pela legalidade, legitimidade e autorização de uso dos dados disponibilizados à CONTRATADA.

Parágrafo terceiro. Em caso de incidente de segurança envolvendo dados pessoais, a parte que tiver ciência deverá comunicar a outra em prazo razoável, observadas as exigências legais aplicáveis.

---

# CLÁUSULA 15 — DA PROPRIEDADE INTELECTUAL

A plataforma, metodologia, fluxos, layouts, dashboards, modelos, documentos, códigos, estruturas, componentes tecnológicos e materiais da CLINIONEX360 pertencem exclusivamente à CONTRATADA.

Parágrafo primeiro. A CONTRATANTE recebe apenas direito de uso limitado, não exclusivo, intransferível e condicionado à vigência do contrato.

Parágrafo segundo. É vedada a cópia, reprodução, cessão, revenda, adaptação, engenharia reversa ou uso da metodologia e plataforma para criação de solução concorrente ou semelhante.

---

# CLÁUSULA 16 — DO SUPORTE

A CONTRATADA prestará suporte nos canais definidos no kick-off, durante horário comercial, para dúvidas de uso, falhas técnicas e orientações relacionadas à plataforma.

Parágrafo único. Demandas fora do escopo contratado, treinamentos adicionais, alterações relevantes, novos módulos ou customizações específicas poderão ser objeto de proposta complementar.

---

# CLÁUSULA 17 — DA GESTÃO DE MUDANÇAS DE ESCOPO

Qualquer alteração relevante de escopo deverá ser formalizada por aditivo ou proposta complementar, contendo descrição da demanda, prazo, investimento e responsabilidades das partes.

---

# CLÁUSULA 18 — DA RESCISÃO

O contrato poderá ser rescindido:

I. por acordo entre as partes;
II. por inadimplemento não sanado;
III. por descumprimento contratual relevante;
IV. por manifestação unilateral, mediante aviso prévio de 60 dias;
V. por impossibilidade técnica, jurídica ou operacional superveniente.

Parágrafo único. Em caso de rescisão, os valores vencidos e proporcionais até a data de encerramento serão devidos.

---

# CLÁUSULA 19 — DAS DISPOSIÇÕES GERAIS

A tolerância de uma parte quanto ao descumprimento de qualquer obrigação não implicará novação ou renúncia de direito.

A comunicação entre as partes poderá ocorrer por e-mail, plataforma, WhatsApp corporativo ou outro canal definido no kick-off.

---

# CLÁUSULA 20 — DO FORO

Fica eleito o foro da comarca de {{foro_contrato}}, com renúncia a qualquer outro, por mais privilegiado que seja, para dirimir controvérsias oriundas deste contrato.

---

# CLÁUSULA 21 — ASSINATURAS

E, por estarem justas e contratadas, as partes assinam eletronicamente o presente instrumento.

{{cidade_assinatura}}, {{data_assinatura}}.

[[ASSINATURAS]]`;

export const PROPOSTA_TEMPLATE: CommercialTemplate = {
  tipo: "proposta",
  titulo: "Proposta Comercial",
  corpo: PROPOSTA_CORPO,
};

export const CONTRATO_TEMPLATE: CommercialTemplate = {
  tipo: "contrato",
  titulo: "Contrato de Prestação de Serviços — CLINIONEX360",
  corpo: CONTRATO_CORPO,
};

export const COMMERCIAL_TEMPLATES: Record<
  "proposta" | "contrato",
  CommercialTemplate
> = {
  proposta: PROPOSTA_TEMPLATE,
  contrato: CONTRATO_TEMPLATE,
};
