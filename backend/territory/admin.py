from django.contrib import admin

from territory.models import BpaDeclaration


@admin.register(BpaDeclaration)
class BpaDeclarationAdmin(admin.ModelAdmin):
    list_display = ('lot', 'adheres', 'registration_number', 'declared_at')
    list_filter = ('adheres',)
