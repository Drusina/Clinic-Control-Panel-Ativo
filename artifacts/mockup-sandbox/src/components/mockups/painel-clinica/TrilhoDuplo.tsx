import React from "react";
import { 
  Bell, 
  Settings, 
  LogOut, 
  LayoutDashboard, 
  Rocket, 
  Stethoscope, 
  Share2, 
  ShieldAlert, 
  ListChecks, 
  Workflow, 
  FileText, 
  Paperclip, 
  Users, 
  Building2, 
  KeyRound,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  MessageSquare,
  Upload,
  Plus,
  ArrowRightLeft,
  Search,
  MoreVertical
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TrilhoDuplo() {
  return (
    <TooltipProvider>
      <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
        
        {/* Rail 1: Slim Global Chrome (Dark) */}
        <div className="w-16 flex-shrink-0 bg-slate-900 flex flex-col items-center py-4 border-r border-slate-800 z-20">
          <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center font-bold text-white text-xs mb-8 shadow-sm">
            IX
          </div>
          
          <div className="flex flex-col gap-4 flex-1 w-full items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                  <ArrowRightLeft className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Trocar clínica</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Notificações (3)</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex flex-col gap-4 w-full items-center mt-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                  <Settings className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Preferências</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>

            <div className="mt-2">
              <Avatar className="h-9 w-9 border border-slate-700 cursor-pointer">
                <AvatarFallback className="bg-slate-800 text-slate-200 text-xs">CM</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>

        {/* Rail 2: Module Navigation (Light Sidebar) */}
        <div className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col z-10 shadow-sm">
          <div className="h-16 px-4 flex items-center border-b border-slate-100">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-slate-900 truncate" title="Clínica Vida Plena">
                Clínica Vida Plena
              </span>
              <span className="text-xs text-slate-500">Gestor de Clínica</span>
            </div>
          </div>

          <ScrollArea className="flex-1 py-4">
            <div className="px-3 pb-6">
              <div className="space-y-1">
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md bg-blue-50 text-blue-700 font-medium transition-colors">
                  <LayoutDashboard className="w-4 h-4 text-blue-600" />
                  <span className="text-sm">Visão Geral</span>
                </button>
              </div>

              <div className="mt-6">
                <h4 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Onboarding</h4>
                <div className="space-y-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Rocket className="w-4 h-4" />
                    <span className="text-sm">Kickoff</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Stethoscope className="w-4 h-4" />
                    <span className="text-sm">Diagnóstico 360°</span>
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Operação</h4>
                <div className="space-y-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Share2 className="w-4 h-4" />
                    <span className="text-sm">Delegação</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-sm">Mapa de Riscos</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <ListChecks className="w-4 h-4" />
                    <span className="text-sm">Plano de Ação</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Workflow className="w-4 h-4" />
                    <span className="text-sm">Processos</span>
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Documentação</h4>
                <div className="space-y-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm">Documentos</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-sm">Evidências</span>
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <h4 className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Pessoas & Sistemas</h4>
                <div className="space-y-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Equipe Interna</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">Rede Externa</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                    <KeyRound className="w-4 h-4" />
                    <span className="text-sm">Sistemas e Acessos</span>
                  </button>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Dashboard Content */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200 bg-white flex-shrink-0">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Painel da Clínica</span>
              <ChevronRight className="w-4 h-4" />
              <span className="font-medium text-slate-900">Visão Geral</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar..." 
                  className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 bg-slate-50"
                />
              </div>
            </div>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-8 max-w-6xl mx-auto space-y-8">
              
              {/* Header Section */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-slate-900">Clínica Vida Plena</h1>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Em Implantação</Badge>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100">Plano Ouro</Badge>
                  </div>
                  <p className="text-slate-500 flex items-center gap-2">
                    CNPJ 12.345.678/0001-90 <span className="text-slate-300">•</span> Belo Horizonte/MG
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="bg-white">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload de documento
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Nova delegação
                  </Button>
                </div>
              </div>

              {/* Progress Section */}
              <Card className="shadow-sm border-slate-200">
                <CardContent className="p-6">
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">Etapa 4 de 10 — Diagnóstico concluído</h3>
                      <p className="text-sm text-slate-500 mt-1">Próximo passo: Validação do Plano de Ação</p>
                    </div>
                    <span className="text-2xl font-bold text-blue-600">40%</span>
                  </div>
                  <Progress value={40} className="h-2.5 mb-6" />
                  
                  <div className="flex justify-between relative">
                    <div className="absolute top-3 left-0 w-full h-[1px] bg-slate-200 -z-10"></div>
                    
                    <div className="flex flex-col items-center gap-2 bg-white px-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-900">Cadastro</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 bg-white px-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-900">Kickoff</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 bg-white px-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-900">Diagnóstico</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 bg-white px-2">
                      <div className="w-6 h-6 rounded-full border-2 border-blue-600 bg-white text-blue-600 flex items-center justify-center">
                        <span className="text-[10px] font-bold">4</span>
                      </div>
                      <span className="text-xs font-medium text-blue-600">Plano de Ação</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 bg-white px-2">
                      <div className="w-6 h-6 rounded-full border border-slate-300 bg-slate-50 text-slate-400 flex items-center justify-center">
                        <span className="text-[10px] font-medium">5</span>
                      </div>
                      <span className="text-xs text-slate-400">Processos</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Share2 className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-slate-500 text-sm font-medium">Delegação</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">12</span>
                        <span className="text-sm text-slate-500">abertas</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-sm font-medium text-red-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> 3 atrasadas
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-amber-50 text-amber-600 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-slate-500 text-sm font-medium">Mapa de Riscos</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">5</span>
                        <span className="text-sm text-slate-500">ativos</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-sm font-medium text-amber-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> 2 críticos
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                        <ListChecks className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-slate-500 text-sm font-medium">Plano de Ação</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">8</span>
                        <span className="text-sm text-slate-500">tarefas</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-sm font-medium text-emerald-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> 3 em andamento
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <FileText className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-slate-500 text-sm font-medium">Documentos</h3>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900">24</span>
                        <span className="text-sm text-slate-500">total</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <span className="text-sm font-medium text-amber-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> 3 vencendo (30d)
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Pendências */}
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    Pendências e Alertas
                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 ml-1">4</Badge>
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-4 p-4 rounded-lg border border-red-100 bg-red-50/50">
                      <div className="mt-0.5 p-1.5 bg-red-100 text-red-600 rounded-md">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-slate-900">2 delegações atrasadas há +5 dias</h4>
                        <p className="text-sm text-slate-500 mt-1">É necessário reenviar o lembrete para os responsáveis ou reatribuir as tarefas.</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-100">
                        Resolver
                      </Button>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-lg border border-amber-100 bg-amber-50/50">
                      <div className="mt-0.5 p-1.5 bg-amber-100 text-amber-600 rounded-md">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-slate-900">Documento "Contrato Social" vence em 8 dias</h4>
                        <p className="text-sm text-slate-500 mt-1">A validade atual expira em breve. Solicite a versão atualizada.</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-800 hover:bg-amber-100">
                        Atualizar
                      </Button>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-lg border border-blue-100 bg-blue-50/50">
                      <div className="mt-0.5 p-1.5 bg-blue-100 text-blue-600 rounded-md">
                        <Stethoscope className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-slate-900">Diagnóstico 360° aguardando validação</h4>
                        <p className="text-sm text-slate-500 mt-1">O time interno concluiu o preenchimento. Necessária revisão do gestor.</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-700 hover:text-blue-800 hover:bg-blue-100">
                        Revisar
                      </Button>
                    </div>

                    <div className="flex items-start gap-4 p-4 rounded-lg border border-red-100 bg-red-50/50">
                      <div className="mt-0.5 p-1.5 bg-red-100 text-red-600 rounded-md">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-slate-900">1 risco crítico sem plano de ação</h4>
                        <p className="text-sm text-slate-500 mt-1">Risco classificado como Alto na área de Segurança da Informação.</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-100">
                        Criar plano
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Sidebar Cards */}
                <div className="space-y-6">
                  {/* Atalhos Rápidos */}
                  <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        Atalhos Rápidos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" className="w-full justify-start text-slate-600 hover:text-slate-900">
                        <Stethoscope className="w-4 h-4 mr-2 text-slate-400" />
                        Abrir Diagnóstico
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-slate-600 hover:text-slate-900">
                        <Share2 className="w-4 h-4 mr-2 text-slate-400" />
                        Nova delegação
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-slate-600 hover:text-slate-900">
                        <Upload className="w-4 h-4 mr-2 text-slate-400" />
                        Upload de documento
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-slate-600 hover:text-slate-900">
                        <ListChecks className="w-4 h-4 mr-2 text-slate-400" />
                        Ver plano de ação
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Contato */}
                  <Card className="shadow-sm border-slate-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        Contato Principal
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 mb-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-blue-100 text-blue-700 font-medium">CM</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-slate-900">Dra. Carla Mendes</p>
                          <p className="text-xs text-slate-500">Responsável</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm text-slate-600 mb-4">
                        <p className="truncate" title="carla@vidaplena.com.br">carla@vidaplena.com.br</p>
                        <p>(31) 98888-1234</p>
                      </div>

                      <Button className="w-full bg-slate-900 hover:bg-slate-800">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Enviar mensagem
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

            </div>
          </ScrollArea>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default TrilhoDuplo;