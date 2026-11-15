from django.urls import path

from market.views import SuggestedPriceView

urlpatterns = [
    path('market/suggested-price/', SuggestedPriceView.as_view(), name='market-suggested-price'),
]
