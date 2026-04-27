/**
 * Default text content for the 6 LGPD/contractual documents.
 *
 * The first one (`termos-de-uso`) uses the operator-supplied wording for the
 * IONEX360 platform Terms of Use. The remaining five are generic LGPD
 * templates for aesthetic clinics and MUST be reviewed by the operator before
 * any real send (the admin UI shows a warning to that effect).
 *
 * Placeholders use Handlebars-style `{{path.to.field}}` tokens that are
 * substituted at render time by `lib/lgpd-pdf.ts`.
 *
 * Available placeholders:
 *   {{contratada.razao_social}}        BLU SOLLUTTIONS LTDA
 *   {{contratada.cnpj}}                55.190.026/0001-31
 *   {{contratada.endereco}}            Av. Brasil 2125, sala 04-A
 *   {{contratada.cidade_uf}}           Sorriso/MT
 *   {{contratada.cep}}                 78.890-126
 *   {{contratada.representante_nome}}  Rafaela Calgaro
 *   {{contratada.representante_cpf}}   032.539.209-92
 *   {{contratada.representante_cargo}} Sócia-Administradora
 *   {{contratante.razao_social}}       (clinic.razaoSocial ?? clinic.nome)
 *   {{contratante.nome_fantasia}}      (clinic.fantasia ?? clinic.nome)
 *   {{contratante.cnpj}}               (clinic.cnpj)
 *   {{contratante.endereco}}           (clinic.endereco)
 *   {{contratante.cidade_uf}}          "<cidade>/<uf>"
 *   {{contratante.cep}}                (clinic.cep)
 *   {{contratante.responsavel}}        (clinic.responsavel)
 *   {{data}}                           DD de <mês> de YYYY
 */

export interface DefaultTemplate {
  slug: string;
  titulo: string;
  descricao: string;
  corpo: string;
}

const TERMOS_DE_USO_BODY = `
## 1. Objeto

O presente instrumento regula o uso da plataforma de gestão clínica **IONEX360**, incluindo seus módulos de Diagnóstico 360°, Kick-off, Templates ICS, Integrações e demais funcionalidades disponibilizadas à Contratante para apoio à gestão operacional, administrativa e estratégica de sua clínica.

## 2. Aceitação

O aceite destes Termos, seja por assinatura digital, eletrônica ou anexação formal pela Contratante, implica concordância integral e incondicional com todas as cláusulas aqui dispostas, vinculando a clínica, seus sócios, prepostos e usuários autorizados.

## 3. Cadastro e Acesso

- O acesso à plataforma é pessoal, intransferível e mediante credenciais individuais.
- A Contratante é responsável pela guarda das credenciais e por todas as ações realizadas em sua conta.
- Suspeitas de uso indevido devem ser comunicadas imediatamente à IONEX360 pelo canal suporte@clinionex.com.br.

## 4. Uso Permitido

A Contratante compromete-se a utilizar a plataforma exclusivamente para fins lícitos, relacionados à gestão clínica, vedando-se: (i) engenharia reversa; (ii) uso para fins concorrenciais; (iii) inserção de dados falsos; (iv) uso para tratamento de dados sensíveis fora dos limites da LGPD.

## 5. Propriedade Intelectual

Todos os direitos sobre a plataforma IONEX360, incluindo software, marca, layout, metodologias, templates ICS e Diagnóstico 360°, pertencem exclusivamente à IONEX360, sendo concedida à Contratante apenas licença de uso não exclusiva e revogável durante a vigência deste Termo.

## 6. Disponibilidade e Suporte

A IONEX360 envidará seus melhores esforços para manter a plataforma disponível em regime 24/7, ressalvadas paradas programadas para manutenção e eventos de força maior. O suporte técnico será prestado em horário comercial pelo canal suporte@clinionex.com.br.

## 7. Limitação de Responsabilidade

A IONEX360 não responde por: (i) decisões clínicas ou administrativas tomadas pela Contratante com base nas informações da plataforma; (ii) perdas decorrentes de uso indevido das credenciais; (iii) eventos de força maior, indisponibilidade de internet ou falhas de terceiros.

## 8. Vigência e Rescisão

Este Termo vigora por prazo indeterminado a contar do aceite, podendo ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias, sem prejuízo das obrigações já assumidas.

## 9. Confidencialidade e LGPD

As partes se comprometem a observar a Lei nº 13.709/2018 (LGPD) e a manter sigilo sobre dados confidenciais trocados em razão deste Termo, conforme detalhado em instrumento específico (NDA e Política de Privacidade).

## 10. Foro

Fica eleito o foro da Comarca de {{contratante.cidade_uf}} para dirimir quaisquer controvérsias oriundas deste Termo, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
`.trim();

const POLITICA_PRIVACIDADE_BODY = `
## 1. Objeto

Esta Política de Privacidade descreve como a **Contratada** trata os dados pessoais de pacientes, colaboradores e parceiros da **Contratante** no contexto do uso da plataforma IONEX360, em conformidade com a Lei nº 13.709/2018 (LGPD).

## 2. Dados Tratados

A plataforma trata as seguintes categorias de dados, conforme alimentadas pela Contratante:

- Dados cadastrais de pacientes (nome, CPF, contato, data de nascimento).
- Dados clínicos relacionados ao plano de tratamento estético (anamnese, evolução, antes/depois).
- Dados de colaboradores e prestadores (nome, função, contato).
- Dados administrativos (faturas, contratos, indicadores).

## 3. Base Legal

O tratamento ocorre com base em: (i) execução de contrato; (ii) cumprimento de obrigação legal; (iii) consentimento específico do titular quando exigido (ex.: autorização de imagem); (iv) legítimo interesse da Contratante para gestão e melhoria do serviço.

## 4. Finalidades

- Permitir à Contratante a gestão administrativa e clínica de sua operação.
- Gerar indicadores, relatórios e diagnósticos de gestão (Diagnóstico 360°).
- Cumprir obrigações sanitárias, fiscais e regulatórias.
- Comunicar-se com pacientes para fins assistenciais ou administrativos autorizados.

## 5. Compartilhamento

A Contratada não compartilha dados pessoais com terceiros sem autorização expressa, exceto quando: (i) necessário para execução do contrato (ex.: provedor de e-mail, armazenamento em nuvem); (ii) obrigação legal ou ordem judicial.

## 6. Direitos do Titular

O titular dos dados pode, a qualquer momento, solicitar à Contratante (controladora dos dados): confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revogação de consentimento, conforme art. 18 da LGPD.

## 7. Segurança

A Contratada adota medidas técnicas e administrativas razoáveis para proteger os dados contra acesso não autorizado, perda, alteração ou destruição, incluindo: criptografia em trânsito, controle de acesso por perfil, logs de auditoria e backups periódicos.

## 8. Retenção

Os dados são mantidos pelo prazo necessário ao cumprimento das finalidades acima ou pelos prazos exigidos por lei (ex.: prontuário clínico — 20 anos). Encerrado o contrato, a Contratante poderá solicitar exportação ou eliminação dos dados em até 30 dias.

## 9. Encarregado (DPO)

O Encarregado de Tratamento de Dados (DPO) da Contratante é o responsável legal indicado em seu cadastro na plataforma. Dúvidas podem ser endereçadas ao canal de suporte da IONEX360.

## 10. Aceite

A Contratante declara ciência integral desta Política e compromete-se a observar as disposições da LGPD em sua operação clínica, sendo controladora dos dados dos pacientes que insere na plataforma.
`.trim();

const CONSENTIMENTO_DADOS_BODY = `
## 1. Identificação

A clínica **{{contratante.razao_social}}** (CNPJ {{contratante.cnpj}}), na qualidade de **Controladora**, solicita ao colaborador o consentimento para o tratamento dos dados pessoais estritamente necessários ao uso da plataforma de gestão IONEX360.

> **Importante:** este termo **não abrange dados de pacientes**. A plataforma IONEX360 é uma ferramenta administrativa, financeira e operacional da clínica e **não armazena** prontuário, histórico clínico, dados sensíveis de saúde, fotografias ou qualquer outro dado de paciente.

## 2. Dados Coletados

São tratados **apenas** os dados do colaborador necessários ao acesso e à operação da plataforma:

- Nome completo, e-mail e telefone para contato.
- Função, área e vínculo com a clínica.
- Registros de acesso e ações realizadas na plataforma (logs de auditoria), para fins de segurança e rastreabilidade.

Não são coletados dados sensíveis (saúde, biometria, origem racial, convicção política ou religiosa) nem dados financeiros pessoais do colaborador.

## 3. Finalidades

- Conceder acesso individualizado à plataforma IONEX360.
- Permitir que o colaborador participe das rotinas de gestão atribuídas (kickoff, ações, riscos, documentos da clínica).
- Manter trilha de auditoria das ações realizadas, em cumprimento à LGPD.
- Enviar comunicações operacionais relacionadas ao uso da plataforma (convites, notificações de aprovação, lembretes de tarefas).

## 4. Compartilhamento

Os dados são compartilhados **apenas** com a IONEX360, na qualidade de **Operadora**, para fins de hospedagem, suporte e segurança da plataforma. Não há compartilhamento com terceiros para fins comerciais ou publicitários.

## 5. Tempo de Guarda

Os dados pessoais serão mantidos enquanto o colaborador possuir acesso ativo à plataforma. Após o encerramento do vínculo ou a revogação do acesso, os dados pessoais serão **eliminados em até 30 dias**, sendo preservados apenas os logs de auditoria pelo prazo legal aplicável (até **5 anos**), nos termos do art. 16 da LGPD.

## 6. Direitos do Titular

O colaborador pode exercer, a qualquer momento, seus direitos previstos no art. 18 da LGPD: confirmação, acesso, correção, anonimização, portabilidade, eliminação (quando permitida por lei), informação sobre compartilhamento e revogação do consentimento.

## 7. Consentimento

Ao assinar este termo, o colaborador **consente livre, informada e expressamente** com o tratamento dos seus dados pessoais nas condições aqui descritas, podendo revogar este consentimento a qualquer tempo, observada a manutenção dos logs exigidos por lei.

## 8. Canal de Atendimento

Para exercer seus direitos ou esclarecer dúvidas, o colaborador pode entrar em contato com a clínica pelo telefone ou e-mail informados em seu cadastro, ou com a IONEX360 pelo canal de suporte.
`.trim();

const AUTORIZACAO_IMAGEM_BODY = `
## 1. Objeto

O titular autoriza, em caráter gratuito e por prazo indeterminado, o uso de sua imagem (fotografias e vídeos) e eventuais depoimentos pela clínica **{{contratante.razao_social}}** (CNPJ {{contratante.cnpj}}), nas condições abaixo.

## 2. Finalidades Autorizadas

- Registro técnico no prontuário clínico (antes/durante/depois do tratamento).
- Divulgação em material de marketing, redes sociais, site e materiais impressos da clínica.
- Apresentação em eventos científicos, treinamentos internos e cases clínicos para fins didáticos.
- Compartilhamento com a plataforma IONEX360 para fins de gestão e análise interna da clínica, com tratamento confidencial.

## 3. Restrições

- O uso será sempre vinculado à imagem do titular como paciente da clínica, sem associação com produtos, marcas ou conteúdos políticos sem nova autorização específica.
- A clínica compromete-se a não divulgar dados que permitam identificação do titular sem seu consentimento (ex.: nome completo + imagem em material público).
- Imagens íntimas só serão registradas e utilizadas mediante autorização específica adicional.

## 4. Revogação

O titular pode, a qualquer momento, **revogar esta autorização** mediante comunicação escrita à clínica. A revogação produzirá efeito a partir da data da comunicação e impedirá novos usos, mas não atingirá usos já realizados de boa-fé até a data da revogação.

## 5. Direitos Reservados

A clínica permanece como detentora dos direitos de uso das imagens nos termos aqui autorizados, sem qualquer ônus financeiro ao titular ou à clínica, ressalvada a hipótese de revogação prevista na cláusula anterior.

## 6. LGPD

O tratamento das imagens segue as disposições da LGPD (Lei nº 13.709/2018), em especial quando configurarem dado sensível de saúde, sendo armazenadas com as mesmas medidas de segurança aplicáveis ao prontuário clínico.

## 7. Aceite

Ao assinar este termo, o titular declara ter lido e concordado com todas as cláusulas, autorizando livre e expressamente o uso de imagem nas condições descritas.
`.trim();

const NDA_BODY = `
## 1. Partes

São partes deste Acordo de Confidencialidade (NDA) a **Contratada** e a **Contratante** identificadas no cabeçalho deste instrumento.

## 2. Objeto

As partes reconhecem que, em razão da relação contratual mantida via plataforma IONEX360, terão acesso recíproco a informações confidenciais, comprometendo-se a manter sigilo absoluto sobre tais informações.

## 3. Informações Confidenciais

Para os fins deste NDA, são consideradas confidenciais quaisquer informações comerciais, financeiras, operacionais, técnicas, estratégicas, de pacientes, de colaboradores, fornecedores ou parceiros, divulgadas verbalmente, por escrito, eletronicamente ou por qualquer outro meio.

## 4. Obrigações

As partes obrigam-se a:

- Não divulgar, reproduzir, copiar ou ceder a terceiros, no todo ou em parte, qualquer informação confidencial sem autorização prévia e expressa da outra parte.
- Adotar medidas de segurança adequadas para proteção das informações.
- Restringir o acesso às informações apenas a colaboradores que delas necessitem para execução do contrato, mediante termo equivalente.
- Comunicar imediatamente à outra parte qualquer suspeita de vazamento, uso indevido ou perda de informação confidencial.

## 5. Exceções

Não se considera violação deste NDA a divulgação de informações que: (i) sejam de domínio público sem culpa da parte receptora; (ii) já fossem de conhecimento legítimo da parte receptora antes da divulgação; (iii) sejam exigidas por lei, ordem judicial ou autoridade competente, mediante notificação prévia à outra parte sempre que possível.

## 6. Vigência

A obrigação de confidencialidade vigora durante a vigência do contrato principal e perdura por **5 (cinco) anos** após seu término, independentemente do motivo da rescisão.

## 7. Penalidades

A parte que descumprir as obrigações deste NDA responderá por perdas e danos, incluindo lucros cessantes, sem prejuízo de eventuais sanções civis e criminais aplicáveis.

## 8. Foro

Fica eleito o foro de {{contratante.cidade_uf}} para dirimir controvérsias oriundas deste NDA.
`.trim();

const RESPONSABILIDADE_OPERADOR_BODY = `
## 1. Objeto

O presente termo declara a **responsabilidade da Contratante**, na qualidade de **Controladora** dos dados pessoais que insere e processa na plataforma IONEX360, conforme as definições da Lei nº 13.709/2018 (LGPD).

## 2. Papéis na LGPD

- A **Contratante** ({{contratante.razao_social}}) é a **Controladora** dos dados pessoais inseridos na plataforma — toma as decisões sobre o tratamento (finalidade, base legal, retenção).
- A **Contratada** ({{contratada.razao_social}}) atua como **Operadora**, processando os dados em nome da Contratante e nos limites estabelecidos por esta.

## 3. Obrigações da Contratante (Controladora)

- Garantir base legal adequada para o tratamento dos dados que insere na plataforma (consentimento, execução de contrato, obrigação legal etc.).
- Manter atualizadas as informações cadastrais dos titulares.
- Atender às requisições dos titulares (art. 18 LGPD) no prazo legal de 15 dias.
- Comunicar à Autoridade Nacional de Proteção de Dados (ANPD) e aos titulares afetados eventuais incidentes de segurança envolvendo dados pessoais (art. 48 LGPD).
- Designar Encarregado (DPO) ou indicar canal de comunicação com os titulares.
- Garantir que seus colaboradores e prestadores observem as regras de tratamento de dados.

## 4. Obrigações da Contratada (Operadora)

- Tratar os dados estritamente conforme as instruções da Controladora.
- Adotar medidas técnicas e administrativas para proteção dos dados.
- Não compartilhar dados com terceiros sem autorização da Controladora, salvo obrigação legal.
- Notificar a Controladora sobre incidentes de segurança identificados na plataforma.
- Manter logs de acesso a documentos privados e disponibilizá-los à Controladora quando solicitado.

## 5. Sub-Operadores

A Contratada pode contratar sub-operadores (provedor de cloud, e-mail transacional etc.) para execução do serviço, comprometendo-se a exigir destes os mesmos padrões de proteção de dados aqui estabelecidos.

## 6. Devolução / Exclusão

Encerrado o contrato, a Contratada compromete-se a devolver ou eliminar os dados pessoais tratados em nome da Contratante no prazo de 30 (trinta) dias, salvo obrigação legal de retenção.

## 7. Aceite

A Contratante declara ciência de seus deveres como Controladora dos dados pessoais e compromete-se a observar integralmente as disposições da LGPD em sua operação clínica.
`.trim();

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    slug: "termos-de-uso",
    titulo: "Termos de Uso da Plataforma IONEX360",
    descricao: "Aceite dos termos de uso da plataforma de gestão IONEX360 pela clínica.",
    corpo: TERMOS_DE_USO_BODY,
  },
  {
    slug: "politica-privacidade",
    titulo: "Política de Privacidade e LGPD",
    descricao: "Ciência e concordância com a política de privacidade e tratamento de dados conforme LGPD.",
    corpo: POLITICA_PRIVACIDADE_BODY,
  },
  {
    slug: "consentimento-dados",
    titulo: "Consentimento para Tratamento de Dados Pessoais",
    descricao: "Consentimento dos colaboradores para o tratamento mínimo de dados pessoais necessário ao uso da plataforma IONEX360. Não abrange dados de pacientes.",
    corpo: CONSENTIMENTO_DADOS_BODY,
  },
  {
    slug: "autorizacao-imagem",
    titulo: "Autorização de Uso de Imagem e Depoimentos",
    descricao: "Permissão para uso de imagens, vídeos e depoimentos para fins de marketing e treinamento.",
    corpo: AUTORIZACAO_IMAGEM_BODY,
  },
  {
    slug: "nda",
    titulo: "Acordo de Confidencialidade (NDA)",
    descricao: "Termo de não divulgação de informações estratégicas e operacionais da clínica e da IONEX360.",
    corpo: NDA_BODY,
  },
  {
    slug: "responsabilidade-operador",
    titulo: "Responsabilidade do Operador de Dados",
    descricao: "Declaração de responsabilidade da clínica como operadora de dados pessoais segundo a LGPD.",
    corpo: RESPONSABILIDADE_OPERADOR_BODY,
  },
];

export const TEMPLATE_SLUGS = DEFAULT_TEMPLATES.map((t) => t.slug);
export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];
