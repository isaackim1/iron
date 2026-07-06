import { View } from 'react-native';
import { GroupsGrid } from '@/components/groups-grid';
import { BackChevron, Screen, Txt } from '@/components/ui';
import { useApp } from '@/lib/store';

/**
 * Group switcher reachable from Manage — leaders don't have the Group tab,
 * but may also belong to other groups as regular members.
 */
export default function Groups() {
  const { t } = useApp();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BackChevron />
        <Txt variant="title" size={24}>
          {t('groups.title')}
        </Txt>
      </View>
      <GroupsGrid />
    </Screen>
  );
}
