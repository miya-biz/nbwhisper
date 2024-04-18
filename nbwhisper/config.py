from traitlets import Unicode, Bool
from traitlets.config.configurable import Configurable

class NBWhisper(Configurable):
    signaling_url = Unicode(
        'signaling_url',
        help='signaling_url',
    ).tag(config=True)

    api_key = Unicode(
        'api_key',
        help='api_key',
    ).tag(config=True)

    channel_id_prefix = Unicode(
        'channel_id_prefix',
        help='channel_id_prefix'
    ).tag(config=True)

    channel_id_suffix = Unicode(
        'channel_id_suffix',
        help='channel_id_suffix'
    ).tag(config=True)

    default_username = Unicode(
        'jovyan', 
        help='Default Username'
    ).tag(config=True)

    share_current_tab_only = Bool(
        True,
        help='share_current_tab_only',
    ).tag(config=True)
    