'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CheckCircle, Clock, Shirt, Bed, Bath, Plus, ArrowRight, Sparkles, Droplets } from 'lucide-react'

export default function ServicePortalOriginal() {
  const [selectedService, setSelectedService] = useState<'cleaning' | 'laundry'>('cleaning')
  const [draggedTask, setDraggedTask] = useState<string | null>(null)

  // 5. Service-spezifische Anpassungen
  const serviceThemes = {
    cleaning: {
      primary: 'from-blue-500 to-cyan-500',
      secondary: 'bg-blue-50 border-blue-200',
      accent: 'text-blue-600',
      icon: Sparkles
    },
    laundry: {
      primary: 'from-green-500 to-emerald-500',
      secondary: 'bg-green-50 border-green-200',
      accent: 'text-green-600',
      icon: Droplets
    }
  }

  const theme = serviceThemes[selectedService]
  const ServiceIcon = theme.icon

  const cleaningTasks = [
    { id: '1', title: 'Badezimmer reinigen', status: 'pending', progress: 0, items: ['Dusche', 'WC', 'Waschbecken'] },
    { id: '2', title: 'Küche säubern', status: 'in-progress', progress: 60, items: ['Herd', 'Spüle', 'Arbeitsflächen'] },
    { id: '3', title: 'Schlafzimmer', status: 'completed', progress: 100, items: ['Betten machen', 'Staubsaugen'] }
  ]

  const laundryItems = [
    { id: '1', type: 'Bettwäsche', count: 4, icon: Bed, status: 'pending' },
    { id: '2', type: 'Handtücher', count: 8, icon: Bath, status: 'in-progress' },
    { id: '3', type: 'Küchentücher', count: 6, icon: Shirt, status: 'completed' }
  ]

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault()
    if (draggedTask) {
      // Update task status logic here
      console.log(`Moving task ${draggedTask} to ${newStatus}`)
      setDraggedTask(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className={`rounded-xl p-6 bg-gradient-to-r ${theme.primary} text-white`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <ServiceIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  {selectedService === 'cleaning' ? 'Reinigungsportal' : 'Wäscheportal'}
                </h1>
                <p className="text-white/80">
                  {selectedService === 'cleaning' ? 'Amela Reinigungsservice' : 'Teuni Wäscheservice'}
                </p>
              </div>
            </div>
            
            {/* Service Toggle */}
            <div className="flex bg-white/20 rounded-lg p-1">
              <Button
                variant={selectedService === 'cleaning' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedService('cleaning')}
                className={`
                  ${selectedService === 'cleaning' 
                    ? 'bg-white text-blue-600 hover:bg-white/90' 
                    : 'text-white hover:bg-white/10'
                  }
                `}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Reinigung
              </Button>
              <Button
                variant={selectedService === 'laundry' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedService('laundry')}
                className={`
                  ${selectedService === 'laundry' 
                    ? 'bg-white text-green-600 hover:bg-white/90' 
                    : 'text-white hover:bg-white/10'
                  }
                `}
              >
                <Droplets className="w-4 h-4 mr-2" />
                Wäscherei
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {selectedService === 'cleaning' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Ausstehend */}
          <Card 
            className="status-pending"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'pending')}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-orange-700">Ausstehend</span>
                <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                  {cleaningTasks.filter(t => t.status === 'pending').length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cleaningTasks
                .filter(task => task.status === 'pending')
                .map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="task-card group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                        {task.title}
                      </h4>
                      <Clock className="w-5 h-5 text-orange-500" />
                    </div>
                    
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Fortschritt</span>
                        <span className="font-medium text-orange-600">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} className="h-2" />
                    </div>

                    <div className="space-y-1">
                      {task.items.map((item, index) => (
                        <div key={index} className="flex items-center text-sm text-gray-600">
                          <div className="w-2 h-2 bg-orange-400 rounded-full mr-2" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
              ))}
              <Button 
                variant="ghost" 
                className="w-full border-2 border-dashed border-orange-300 text-orange-600 hover:bg-orange-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Aufgabe hinzufügen
              </Button>
            </CardContent>
          </Card>

          {/* In Bearbeitung */}
          <Card 
            className="status-in-progress"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'in-progress')}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-blue-700">In Bearbeitung</span>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                  {cleaningTasks.filter(t => t.status === 'in-progress').length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cleaningTasks
                .filter(task => task.status === 'in-progress')
                .map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="task-card group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                        {task.title}
                      </h4>
                      <Clock className="w-5 h-5 text-blue-500" />
                    </div>
                    
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Fortschritt</span>
                        <span className="font-medium text-blue-600">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} className="h-2" />
                    </div>

                    <div className="space-y-1">
                      {task.items.map((item, index) => (
                        <div key={index} className="flex items-center text-sm text-gray-600">
                          <div className="w-2 h-2 bg-blue-400 rounded-full mr-2" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
              ))}
              <Button 
                variant="ghost" 
                className="w-full border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Aufgabe hinzufügen
              </Button>
            </CardContent>
          </Card>

          {/* Abgeschlossen */}
          <Card 
            className="status-completed"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, 'completed')}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="text-green-700">Abgeschlossen</span>
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  {cleaningTasks.filter(t => t.status === 'completed').length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cleaningTasks
                .filter(task => task.status === 'completed')
                .map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    className="task-card group opacity-75"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800 group-hover:text-green-600 transition-colors">
                        {task.title}
                      </h4>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                    
                    <div className="mb-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600">Fortschritt</span>
                        <span className="font-medium text-green-600">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} className="h-2" />
                    </div>

                    <div className="space-y-1">
                      {task.items.map((item, index) => (
                        <div key={index} className="flex items-center text-sm text-gray-600">
                          <CheckCircle className="w-3 h-3 text-green-500 mr-2" />
                          <span className="line-through">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
              ))}
              <Button 
                variant="ghost" 
                className="w-full border-2 border-dashed border-green-300 text-green-600 hover:bg-green-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Aufgabe hinzufügen
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Laundry Content */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="service-laundry">
            <CardHeader>
              <CardTitle className="text-green-700">Wäscheartikel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {laundryItems.map(item => {
                const Icon = item.icon
                return (
                  <div key={item.id} className="task-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <Icon className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{item.type}</p>
                          <p className="text-sm text-gray-600">{item.count} Stück</p>
                        </div>
                      </div>
                      <Badge className={`
                        ${item.status === 'completed' ? 'bg-green-100 text-green-700' : 
                          item.status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 
                          'bg-orange-100 text-orange-700'
                        }
                      `}>
                        {item.status === 'completed' ? 'Fertig' : 
                         item.status === 'in-progress' ? 'In Arbeit' : 'Wartend'}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card className="service-laundry">
            <CardHeader>
              <CardTitle className="text-green-700">Bestellungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="task-card">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-800">Bestellung #001</h4>
                  <Badge className="bg-orange-100 text-orange-700">Ausstehend</Badge>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>4x Bettwäsche</span>
                    <span className="text-gray-500">Wartend</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>8x Handtücher</span>
                    <span className="text-gray-500">Wartend</span>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500">
                  <span>Bestellt: 23.09.2024</span>
                  <span>Lieferung: 24.09.2024</span>
                </div>
              </div>

              <Button className="w-full laundry-gradient">
                <Plus className="w-4 h-4 mr-2" />
                Neue Bestellung
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}